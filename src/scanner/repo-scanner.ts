import { readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import {
  Node,
  Project,
  SyntaxKind,
  type BindingElement,
  type CallExpression,
  type ObjectLiteralExpression,
  type SourceFile,
  type SwitchStatement,
} from 'ts-morph';
import type {
  CallSiteKind,
  ChangeKind,
  ChangeRecord,
  Confidence,
  ImpactFinding,
  ImpactReport,
  NeedsHumanItem,
  UnresolvedItem,
  UnresolvedKind,
} from '../domain/types.js';
import { buildProjectIndex, type SourceFacts } from './project-index.js';
import { mapSdkOperation, operationMatchesChange, type SdkOperation } from './sdk-map.js';
import { toPosixPath } from '../util/paths.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'vendor',
]);
const FIELD_LEVEL_KINDS: ReadonlySet<ChangeKind> = new Set<ChangeKind>([
  'field_removed',
  'field_renamed',
  'field_type_changed',
  'field_became_required',
  'enum_value_removed',
  'expandable_field_removed',
  'expandable_target_removed',
]);
const EVENT_TYPE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$/;
const INLINE_CLIENT = '<inline>';
const MAX_SNIPPET_LENGTH = 240;

type FieldContext = 'request' | 'response' | 'typed' | 'webhook' | 'expand';

interface ExtractedField {
  segments: string[];
  confidence: Confidence;
  value?: string;
  rawValue?: string;
}

interface ExtractionIssue {
  kind: UnresolvedKind;
  position: number;
  snippet: string;
  reason: string;
}

interface ExtractionResult {
  fields: ExtractedField[];
  issues: ExtractionIssue[];
}

interface ClientRoot {
  text: string;
  length: number;
}

interface SdkCallInfo {
  call: CallExpression;
  root: ClientRoot;
  parts: string[];
  operation?: SdkOperation;
}

interface DerivedValue {
  parts: string[];
  operation?: SdkOperation;
}

interface FindingInput {
  change: ChangeRecord;
  position: number;
  operation: string;
  fieldPath: string[];
  kind: CallSiteKind;
  confidence: Confidence;
  snippet: string;
  reason: string;
  confidenceReason: string;
  openApiOperation?: string;
}

export class RepoScanner {
  async scan(root: string, changes: ChangeRecord[]): Promise<ImpactReport> {
    const repositoryRoot = resolve(root);
    const sourcePaths = await collectSourceFiles(repositoryRoot);
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions: { allowJs: true, target: 99 },
    });
    if (sourcePaths.length > 0) project.addSourceFilesAtPaths(sourcePaths);

    const factsByFile = buildProjectIndex(project);
    const fieldChanges = changes.filter(
      (change) => FIELD_LEVEL_KINDS.has(change.kind) && change.path !== undefined,
    );
    const needsHuman = changes
      .filter((change) => !fieldChanges.includes(change))
      .map(buildNeedsHumanItem);

    const findings: ImpactFinding[] = [];
    const unresolved: UnresolvedItem[] = [];
    const sourceFiles = [...project.getSourceFiles()].sort((left, right) =>
      left.getFilePath().localeCompare(right.getFilePath()),
    );

    for (const sourceFile of sourceFiles) {
      const file = resolve(sourceFile.getFilePath());
      const relativeFile = toPosixPath(relative(repositoryRoot, file));
      const facts = factsByFile.get(normalizePath(file));
      if (!facts) continue;
      const result = new FileScan({
        sourceFile,
        file: relativeFile,
        facts,
        changes: fieldChanges,
        allChanges: changes,
      }).run();
      findings.push(...result.findings);
      unresolved.push(...result.unresolved);
    }

    return {
      generatedAt: new Date().toISOString(),
      root: toPosixPath(repositoryRoot),
      changes,
      findings: dedupeFindings(findings).sort(compareFindings),
      needsHuman,
      unresolved: dedupeUnresolved(unresolved).sort(compareUnresolved),
      unverifiedCallSiteCoverage: buildCoverageNotes(needsHuman, unresolved, sourcePaths.length),
    };
  }
}

class FileScan {
  private readonly derived = new Map<string, DerivedValue>();
  private readonly eventTypes = new Map<string, string>();
  private readonly findings: ImpactFinding[] = [];
  private readonly unresolved: UnresolvedItem[] = [];

  constructor(
    private readonly options: {
      sourceFile: SourceFile;
      file: string;
      facts: SourceFacts;
      changes: ChangeRecord[];
      allChanges: ChangeRecord[];
    },
  ) {}

  run(): { findings: ImpactFinding[]; unresolved: UnresolvedItem[] } {
    this.collectUnresolvedImports();
    this.collectDerivedValues();
    this.collectEventNarrowing();
    this.scanSdkCalls();
    this.scanDestructuredBindings();
    this.scanPropertyAccess();
    this.scanWebhookSwitches();
    this.scanDynamicSites();
    return { findings: this.findings, unresolved: this.unresolved };
  }

  private collectUnresolvedImports(): void {
    for (const moduleSpecifier of this.options.facts.unresolvedImports) {
      const position = 0;
      this.recordUnresolved({
        kind: 'unresolved_import',
        position,
        snippet: `import ... from '${moduleSpecifier}'`,
        reason: `Import '${moduleSpecifier}' could not be resolved statically; Stripe usage in this module is unverified.`,
      });
    }
  }

  private collectDerivedValues(): void {
    const sourceFile = this.options.sourceFile;
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const initializer = declaration.getInitializer();
      if (!initializer) continue;
      const info = this.findSdkCall(initializer);
      const nameNode = declaration.getNameNode();
      if (Node.isIdentifier(nameNode) && info) {
        this.derived.set(nameNode.getText(), {
          parts: info.parts,
          ...(info.operation === undefined ? {} : { operation: info.operation }),
        });
      }
      if (Node.isObjectBindingPattern(nameNode) && info) {
        for (const element of nameNode.getElements()) {
          const name = bindingPropertyName(element);
          if (name === undefined) continue;
          this.derived.set(name, {
            parts: info.parts,
            ...(info.operation === undefined ? {} : { operation: info.operation }),
          });
        }
      }
    }

    for (const assignment of sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      if (assignment.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
      const left = assignment.getLeft();
      if (!Node.isIdentifier(left)) continue;
      const info = this.findSdkCall(assignment.getRight());
      if (!info) continue;
      this.derived.set(left.getText(), {
        parts: info.parts,
        ...(info.operation === undefined ? {} : { operation: info.operation }),
      });
    }
  }

  private collectEventNarrowing(): void {
    for (const [name, eventType] of this.options.facts.typeGuardEvents) {
      this.eventTypes.set(name, eventType);
    }
    for (const call of this.options.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      if (!Node.isIdentifier(expression)) continue;
      const eventType = this.eventTypes.get(expression.getText());
      if (!eventType) continue;
      const [argument] = call.getArguments();
      if (argument && Node.isIdentifier(argument)) {
        this.eventTypes.set(argument.getText(), eventType);
      }
    }
  }

  private scanSdkCalls(): void {
    for (const call of this.options.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const info = this.findSdkCall(call);
      if (!info) continue;
      if (info.parts[0] === 'webhooks' && info.parts[1] === 'constructEvent') continue;
      if (info.operation === undefined) {
        this.recordUnresolved({
          kind: 'unknown_type',
          position: call.getStart(),
          snippet: call.getText().slice(0, MAX_SNIPPET_LENGTH),
          reason: `Stripe SDK call "${info.parts.join('.')}" has no documented operation mapping in this version; it is not guessed.`,
        });
        continue;
      }

      const operationText = info.parts.join('.');
      for (const argument of call.getArguments()) {
        const extraction = this.extractArgument(argument);
        for (const issue of extraction.issues) this.recordUnresolved(issue);
        for (const field of extraction.fields) {
          this.matchField({
            field,
            operation: info.operation,
            context: field.segments[0] === 'expand' ? 'expand' : 'request',
            add: (change, matchedSegments, confidence) =>
              this.addFinding({
                change,
                position: call.getStart(),
                operation: operationText,
                fieldPath: matchedSegments,
                kind: 'sdk_call',
                confidence,
                snippet: call.getText().slice(0, MAX_SNIPPET_LENGTH),
                reason: `Stripe SDK call "${operationText}" sets "${joinPath(matchedSegments)}", which matches the changed ${describeChange(change)}.`,
                confidenceReason:
                  confidence === 'high'
                    ? 'The SDK receiver and object-literal key are statically resolved.'
                    : 'The object literal was resolved through a local identifier.',
                ...(info.operation === undefined ? {} : { openApiOperation: info.operation.label }),
              }),
          });
        }
      }
    }
  }

  private scanDestructuredBindings(): void {
    for (const declaration of this.options.sourceFile.getDescendantsOfKind(
      SyntaxKind.VariableDeclaration,
    )) {
      const nameNode = declaration.getNameNode();
      if (!Node.isObjectBindingPattern(nameNode)) continue;
      const initializer = declaration.getInitializer();
      if (!initializer) continue;
      const info = this.findSdkCall(initializer);
      if (!info) continue;
      for (const element of nameNode.getElements()) {
        const name = bindingPropertyName(element);
        if (name === undefined) continue;
        for (const change of this.options.changes) {
          const segments = toPathSegments(change.path ?? '');
          const last = segments[segments.length - 1];
          if (last !== name) continue;
          if (change.context === 'request_parameter') continue;
          if (change.eventType !== undefined && change.path !== 'data.previous_attributes')
            continue;
          if (
            (change.context === 'request_body' || change.context === 'response') &&
            (info.operation === undefined || !operationMatchesChange(change, info.operation))
          ) {
            continue;
          }
          this.addFinding({
            change,
            position: element.getStart(),
            operation: info.parts.join('.'),
            fieldPath: [name],
            kind: 'sdk_field',
            confidence: 'medium',
            snippet: element.getText().slice(0, MAX_SNIPPET_LENGTH),
            reason: `Property "${name}" is destructured from a Stripe SDK result and matches the changed ${describeChange(change)}.`,
            confidenceReason:
              'The binding comes from a statically identified Stripe SDK call, but runtime values are not proven.',
            ...(info.operation === undefined ? {} : { openApiOperation: info.operation.label }),
          });
        }
      }
    }
  }

  private scanPropertyAccess(): void {
    for (const property of this.options.sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      const parent = property.getParent();
      if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === property) continue;
      const chain = propertyChain(property, this.options.facts.constructorNames);
      const derivedRoot = this.longestRoot(chain, this.derived);
      const typedRoot = this.longestRoot(chain, this.options.facts.typedNames);

      if (derivedRoot) {
        const segments = chain.slice(derivedRoot.length);
        if (segments.length > 0) {
          const value = this.derived.get(derivedRoot.text);
          for (const change of this.options.changes) {
            if (!fieldMatches(change, segments, value?.operation, 'response')) continue;
            if (change.kind === 'field_became_required') continue;
            this.addFinding({
              change,
              position: property.getStart(),
              operation: value?.parts.join('.') ?? 'sdk_result',
              fieldPath: segments,
              kind: 'sdk_field',
              confidence: 'medium',
              snippet: property.getText().slice(0, MAX_SNIPPET_LENGTH),
              reason: `Property "${joinPath(segments)}" is read from a Stripe SDK result and matches the changed ${describeChange(change)}.`,
              confidenceReason:
                'The property chain starts from a local value assigned from a Stripe SDK call; runtime values are not proven.',
              ...(value?.operation === undefined
                ? {}
                : { openApiOperation: value.operation.label }),
            });
          }
        }
      }

      if (typedRoot && !derivedRoot) {
        const resource = this.options.facts.typedNames.get(typedRoot.text);
        if (!resource || resource === 'Event') continue;
        const segments = chain.slice(typedRoot.length);
        if (segments.length === 0) continue;
        for (const change of this.options.changes) {
          if (change.context !== 'schema' || change.resource !== resource) continue;
          if (!exactSegmentsMatch(segments, toPathSegments(change.path ?? ''))) continue;
          if (change.kind === 'field_became_required') continue;
          if (!this.changeOperationMatchesResource(change, resource)) continue;
          const operation = operationForResource(resource);
          this.addFinding({
            change,
            position: property.getStart(),
            operation: `typed.${resource}`,
            fieldPath: segments,
            kind: 'typed_field',
            confidence: 'medium',
            snippet: property.getText().slice(0, MAX_SNIPPET_LENGTH),
            reason: `Property "${joinPath(segments)}" is read from a value typed as Stripe.${resource} and matches the changed field.`,
            confidenceReason:
              'The type annotation identifies a Stripe model, but the value may come from any source.',
            ...(operation === undefined ? {} : { openApiOperation: operation }),
          });
        }
      }
    }
  }

  private scanWebhookSwitches(): void {
    for (const statement of this.options.sourceFile.getDescendantsOfKind(
      SyntaxKind.SwitchStatement,
    )) {
      const root = this.eventRoot(statement);
      if (!root) continue;
      for (const clause of statement.getClauses()) {
        if (!Node.isCaseClause(clause)) continue;
        const expression = clause.getExpression();
        if (!expression || !Node.isStringLiteral(expression)) {
          this.recordUnresolved({
            kind: 'dynamic_webhook_case',
            position: clause.getStart(),
            snippet: clause.getText().slice(0, MAX_SNIPPET_LENGTH),
            reason:
              'A webhook switch case is not a string literal, so its event type is unresolved.',
          });
          continue;
        }
        const eventType = expression.getLiteralValue();
        if (!EVENT_TYPE.test(eventType)) continue;
        this.eventTypes.set(root, eventType);
        for (const property of clause.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
          const parent = property.getParent();
          if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === property) {
            continue;
          }
          const chain = propertyChain(property, this.options.facts.constructorNames);
          if (chain[0] !== root) continue;
          const segments = chain.slice(1);
          if (!segments.includes('object') && !segments.includes('previous_attributes')) continue;
          for (const change of this.options.changes) {
            if (!this.webhookChangeApplies(change, eventType)) continue;
            if (!suffixSegmentsMatch(segments, toPathSegments(change.path ?? ''))) continue;
            this.addFinding({
              change,
              position: property.getStart(),
              operation: `webhook ${eventType}`,
              fieldPath: segments,
              kind: change.path === 'data.previous_attributes' ? 'webhook_handler' : 'sdk_field',
              confidence: 'high',
              snippet: property.getText().slice(0, MAX_SNIPPET_LENGTH),
              reason: `Webhook case "${eventType}" reads "${joinPath(segments)}", which matches the changed ${describeChange(change)}.`,
              confidenceReason:
                'The event type is a literal switch case and the property chain is statically resolved.',
              openApiOperation: `webhook ${eventType}`,
            });
          }
        }
      }
    }

    for (const property of this.options.sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      const parent = property.getParent();
      if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === property) continue;
      const chain = propertyChain(property, this.options.facts.constructorNames);
      const root = chain[0];
      if (!root) continue;
      const eventType = this.eventTypes.get(root);
      if (!eventType) continue;
      const segments = chain.slice(1);
      if (!segments.includes('object') && !segments.includes('previous_attributes')) continue;
      for (const change of this.options.changes) {
        if (!this.webhookChangeApplies(change, eventType)) continue;
        if (!suffixSegmentsMatch(segments, toPathSegments(change.path ?? ''))) continue;
        this.addFinding({
          change,
          position: property.getStart(),
          operation: `webhook ${eventType}`,
          fieldPath: segments,
          kind: 'sdk_field',
          confidence: 'medium',
          snippet: property.getText().slice(0, MAX_SNIPPET_LENGTH),
          reason: `A value narrowed to webhook "${eventType}" reads "${joinPath(segments)}", which matches the changed ${describeChange(change)}.`,
          confidenceReason:
            'A type guard names the event type, but narrowing is inferred from the guard rather than a literal case.',
          openApiOperation: `webhook ${eventType}`,
        });
      }
    }
  }

  private scanDynamicSites(): void {
    for (const element of this.options.sourceFile.getDescendantsOfKind(
      SyntaxKind.ElementAccessExpression,
    )) {
      const chain = propertyChain(element, this.options.facts.constructorNames);
      const root = this.longestRoot(chain, this.options.facts.clientNames);
      const argument = element.getArgumentExpression();
      if (!root || !argument || Node.isStringLiteral(argument)) continue;
      this.recordUnresolved({
        kind: 'dynamic_call',
        position: element.getStart(),
        snippet: element.getText().slice(0, MAX_SNIPPET_LENGTH),
        reason: `Dynamic member "${element.getText().slice(0, 80)}" on a known Stripe receiver cannot be mapped to an OpenAPI operation statically.`,
      });
    }

    for (const call of this.options.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      if (!Node.isIdentifier(expression) || expression.getText() !== 'fetch') continue;
      const [argument] = call.getArguments();
      if (!argument || !Node.isStringLiteral(argument)) continue;
      const url = argument.getLiteralValue();
      if (!url.includes('/v1/')) continue;
      this.recordUnresolved({
        kind: 'rest_call',
        position: call.getStart(),
        snippet: call.getText().slice(0, MAX_SNIPPET_LENGTH),
        reason: `Direct REST call to "${url}" bypasses the SDK call mapping, so its body fields are not verified.`,
      });
    }
  }

  private matchField(input: {
    field: ExtractedField;
    operation?: SdkOperation;
    context: FieldContext;
    add: (change: ChangeRecord, matchedSegments: string[], confidence: Confidence) => void;
  }): void {
    for (const change of this.options.changes) {
      if (change.kind === 'enum_value_removed') {
        if (input.field.value === undefined || input.field.value !== change.oldValue) continue;
      }
      if (input.context === 'expand') {
        if (change.path !== input.field.segments[1]) continue;
        if (
          input.operation &&
          change.operation &&
          !operationMatchesChange(change, input.operation)
        ) {
          continue;
        }
      } else if (!fieldMatches(change, input.field.segments, input.operation, input.context)) {
        continue;
      }
      input.add(change, input.field.segments, input.field.confidence);
    }
  }

  private addFinding(input: FindingInput): void {
    const { line, column } = this.options.sourceFile.getLineAndColumnAtPos(input.position);
    this.findings.push({
      changeId: input.change.id,
      callSite: {
        file: this.options.file,
        line,
        column,
        operation: input.operation,
        ...(input.openApiOperation === undefined
          ? {}
          : { openApiOperation: input.openApiOperation }),
        fieldPath: [...input.fieldPath],
        kind: input.kind,
        snippet: input.snippet,
      },
      confidence: input.confidence,
      reason: input.reason,
      confidenceReason: input.confidenceReason,
    });
  }

  private recordUnresolved(input: {
    kind: UnresolvedKind;
    position: number;
    snippet: string;
    reason: string;
  }): void {
    const { line, column } = this.options.sourceFile.getLineAndColumnAtPos(input.position);
    this.unresolved.push({
      file: this.options.file,
      line,
      column,
      kind: input.kind,
      snippet: input.snippet,
      reason: input.reason,
      relatedChangeIds: relatedChangeIds(this.options.allChanges, input.snippet),
    });
  }

  private findSdkCall(node: Node): SdkCallInfo | undefined {
    const calls = Node.isCallExpression(node)
      ? [node]
      : node.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) continue;
      const chain = propertyChain(callee, this.options.facts.constructorNames);
      const root = this.longestRoot(chain, this.options.facts.clientNames);
      if (!root) continue;
      const parts = chain.slice(root.length);
      if (parts.length < 2) continue;
      const matchedOperation = mapSdkOperation(parts);
      return {
        call,
        root,
        parts,
        ...(matchedOperation === undefined ? {} : { operation: matchedOperation }),
      };
    }
    return undefined;
  }

  private extractArgument(argument: Node): ExtractionResult {
    const value = unwrap(argument);
    if (Node.isSpreadElement(value)) {
      return {
        fields: [],
        issues: [
          {
            kind: 'spread_argument',
            position: value.getStart(),
            snippet: value.getText().slice(0, MAX_SNIPPET_LENGTH),
            reason: 'Spread arguments are not resolved statically; their fields were not verified.',
          },
        ],
      };
    }
    if (Node.isObjectLiteralExpression(value)) return extractLiteral(value, 'high');
    if (Node.isIdentifier(value)) {
      const resolved = this.resolveObjectLiteral(value.getText());
      if (resolved) return extractLiteral(resolved, 'medium');
      if (value.getText() === 'undefined') return { fields: [], issues: [] };
      return {
        fields: [],
        issues: [
          {
            kind: 'spread_argument',
            position: value.getStart(),
            snippet: value.getText().slice(0, MAX_SNIPPET_LENGTH),
            reason: `Argument "${value.getText()}" could not be resolved to a local object literal; its fields were not verified.`,
          },
        ],
      };
    }
    return { fields: [], issues: [] };
  }

  private resolveObjectLiteral(
    name: string,
    seen = new Set<string>(),
  ): ObjectLiteralExpression | undefined {
    if (seen.has(name)) return undefined;
    seen.add(name);
    for (const declaration of this.options.sourceFile.getDescendantsOfKind(
      SyntaxKind.VariableDeclaration,
    )) {
      if (declaration.getName() !== name) continue;
      const initializer = declaration.getInitializer();
      if (!initializer) return undefined;
      const value = unwrap(initializer);
      if (Node.isObjectLiteralExpression(value)) return value;
      if (Node.isIdentifier(value)) return this.resolveObjectLiteral(value.getText(), seen);
      return undefined;
    }
    return undefined;
  }

  private longestRoot(
    chain: string[],
    names: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  ): ClientRoot | undefined {
    for (let length = chain.length - 1; length >= 1; length -= 1) {
      const text = chain.slice(0, length).join('.');
      if (names.has(text) || text === INLINE_CLIENT) return { text, length };
    }
    return undefined;
  }

  private eventRoot(statement: SwitchStatement): string | undefined {
    const expression = statement.getExpression();
    if (!Node.isPropertyAccessExpression(expression) || expression.getName() !== 'type') {
      return undefined;
    }
    const target = expression.getExpression();
    return Node.isIdentifier(target) ? target.getText() : undefined;
  }

  private changeOperationMatchesResource(change: ChangeRecord, resource: string): boolean {
    if (change.operation === undefined) return true;
    const expected = operationForResource(resource);
    return expected === undefined || normalizeOperation(change.operation) === expected;
  }

  private webhookChangeApplies(change: ChangeRecord, eventType: string): boolean {
    if (change.eventType === eventType || change.context === 'webhook_event') return true;
    return change.context === 'schema' && change.resource === 'Customer';
  }
}

function extractLiteral(
  literal: ObjectLiteralExpression,
  confidence: Confidence,
): ExtractionResult {
  const fields: ExtractedField[] = [];
  const issues: ExtractionIssue[] = [];
  extractFields(literal, confidence, [], fields, issues);
  return { fields, issues };
}

function extractFields(
  literal: ObjectLiteralExpression,
  confidence: Confidence,
  prefix: string[],
  fields: ExtractedField[],
  issues: ExtractionIssue[],
): void {
  for (const property of literal.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      issues.push({
        kind: 'spread_argument',
        position: property.getStart(),
        snippet: property.getText().slice(0, MAX_SNIPPET_LENGTH),
        reason:
          'Spread object members are not resolved statically; their fields were not verified.',
      });
      continue;
    }
    if (!Node.isPropertyAssignment(property) && !Node.isShorthandPropertyAssignment(property)) {
      continue;
    }
    const nameNode = Node.isPropertyAssignment(property) ? property.getNameNode() : undefined;
    if (nameNode && Node.isComputedPropertyName(nameNode)) {
      issues.push({
        kind: 'dynamic_call',
        position: nameNode.getStart(),
        snippet: nameNode.getText().slice(0, MAX_SNIPPET_LENGTH),
        reason: 'Computed object keys are resolved at runtime; this field was not verified.',
      });
      continue;
    }
    const name = nameNode
      ? propertyName(nameNode)
      : Node.isShorthandPropertyAssignment(property)
        ? property.getName()
        : undefined;
    if (name === undefined) continue;
    const segments = [...prefix, name];
    const initializer = Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
    const fieldValue = literalValue(initializer);
    fields.push({
      segments,
      confidence,
      ...(fieldValue === undefined ? {} : { value: fieldValue }),
    });
    if (!initializer) continue;
    const initializerValue = unwrap(initializer);
    if (Node.isObjectLiteralExpression(initializerValue)) {
      extractFields(initializerValue, confidence, segments, fields, issues);
      continue;
    }
    if (Node.isArrayLiteralExpression(initializerValue)) {
      fields.push({ segments: [...segments, '[]'], confidence });
      for (const element of initializerValue.getElements()) {
        const item = unwrap(element);
        if (Node.isStringLiteral(item)) {
          fields.push({ segments: [...segments, item.getLiteralValue()], confidence });
        } else if (Node.isObjectLiteralExpression(item)) {
          extractFields(item, confidence, [...segments, '[]'], fields, issues);
        }
      }
    }
  }
}

function literalValue(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  const value = unwrap(node);
  if (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value)) {
    return value.getLiteralValue();
  }
  if (Node.isNumericLiteral(value) || Node.isBigIntLiteral(value)) return value.getText();
  if (Node.isTrueLiteral(value)) return 'true';
  if (Node.isFalseLiteral(value)) return 'false';
  if (Node.isNullLiteral(value)) return 'null';
  return undefined;
}

function fieldMatches(
  change: ChangeRecord,
  segments: string[],
  operation: SdkOperation | undefined,
  context: FieldContext,
): boolean {
  if (change.eventType !== undefined || change.context === 'webhook_event') return false;
  if (!exactSegmentsMatch(segments, toPathSegments(change.path ?? ''))) return false;
  if (change.operation !== undefined) {
    if (operation === undefined) return false;
    return operationMatchesChange(change, operation);
  }
  if (context === 'request' || context === 'response') {
    return operation !== undefined;
  }
  return true;
}

function exactSegmentsMatch(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function suffixSegmentsMatch(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  const offset = longer.length - shorter.length;
  return shorter.every((segment, index) => segment === longer[offset + index]);
}

function operationForResource(resource: string): string | undefined {
  const map: Record<string, string> = {
    Customer: 'GET /v1/customers/{customer}',
    PaymentIntent: 'GET /v1/payment_intents/{intent}',
    Subscription: 'GET /v1/subscriptions/{subscription}',
  };
  return map[resource];
}

function normalizeOperation(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

function propertyName(node: Node): string | undefined {
  if (Node.isIdentifier(node)) return node.getText();
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralValue();
  }
  if (Node.isNumericLiteral(node)) return node.getText();
  return undefined;
}

function bindingPropertyName(element: BindingElement): string | undefined {
  const propertyNode = element.getPropertyNameNode();
  if (propertyNode) {
    const name = propertyName(propertyNode);
    if (name !== undefined) return name;
  }
  const nameNode = element.getNameNode();
  return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined;
}

function propertyChain(node: Node, constructorNames: ReadonlySet<string>): string[] {
  const segments: string[] = [];
  let current: Node = node;
  for (;;) {
    if (Node.isPropertyAccessExpression(current)) {
      segments.unshift(current.getName());
      current = current.getExpression();
      continue;
    }
    if (Node.isElementAccessExpression(current)) {
      const argument = current.getArgumentExpression();
      const name =
        argument && Node.isStringLiteral(argument) ? argument.getLiteralValue() : '[dynamic]';
      segments.unshift(name);
      current = current.getExpression();
      continue;
    }
    if (
      Node.isParenthesizedExpression(current) ||
      Node.isAsExpression(current) ||
      Node.isNonNullExpression(current) ||
      Node.isSatisfiesExpression(current) ||
      Node.isAwaitExpression(current)
    ) {
      current = current.getExpression();
      continue;
    }
    if (Node.isIdentifier(current)) {
      segments.unshift(current.getText());
      return segments;
    }
    if (Node.isThisExpression(current)) {
      segments.unshift('this');
      return segments;
    }
    if (Node.isNewExpression(current)) {
      const text = current.getExpression().getText();
      const isStripe = [...constructorNames].some(
        (name) => text === name || text.startsWith(`${name}.`),
      );
      if (isStripe) {
        segments.unshift(INLINE_CLIENT);
        return segments;
      }
    }
    return segments;
  }
}

function unwrap(node: Node): Node {
  let current = node;
  for (;;) {
    if (
      Node.isParenthesizedExpression(current) ||
      Node.isAsExpression(current) ||
      Node.isNonNullExpression(current) ||
      Node.isSatisfiesExpression(current) ||
      Node.isAwaitExpression(current)
    ) {
      current = current.getExpression();
      continue;
    }
    return current;
  }
}

function toPathSegments(path: string): string[] {
  return path.replaceAll('[]', '.[]').split('.').filter(Boolean);
}

function joinPath(segments: string[]): string {
  return segments.join('.').replaceAll('.[]', '[]');
}

function describeChange(change: ChangeRecord): string {
  const context = change.context ?? 'schema';
  return `${context} change (${change.kind})`;
}

function relatedChangeIds(changes: ChangeRecord[], snippet: string): string[] {
  const lower = snippet.toLowerCase();
  return changes
    .filter((change) => {
      if (change.path === undefined) return false;
      const tokens = toPathSegments(change.path).filter((token) => token !== '[]');
      return tokens.some((token) => lower.includes(token.toLowerCase()));
    })
    .slice(0, 20)
    .map((change) => change.id);
}

function buildNeedsHumanItem(change: ChangeRecord): NeedsHumanItem {
  const operation = change.operation === undefined ? '' : ` for ${change.operation}`;
  const eventType = change.eventType === undefined ? '' : ` for ${change.eventType}`;
  return {
    changeId: change.id,
    kind: change.kind,
    context: change.context ?? 'schema',
    resource: change.resource,
    ...(change.path === undefined ? {} : { path: change.path }),
    reason: `No static call-site mapping is defined for ${change.kind}${operation}${eventType}; review manually. Check callers, defaults, validation, and tests.`,
  };
}

function buildCoverageNotes(
  needsHuman: NeedsHumanItem[],
  unresolved: UnresolvedItem[],
  sourceFileCount: number,
): string[] {
  const extensions = [...SOURCE_EXTENSIONS].sort().join(', ');
  const ignored = [...IGNORED_DIRECTORIES].sort().join(', ');
  const notes = [
    `${sourceFileCount} source file(s) scanned; extensions inspected: ${extensions}; ignored directories: ${ignored}.`,
    'Type annotations are read textually; project path aliases and generated code are not resolved. Dynamic SDK calls, REST fetch calls, and runtime values are not considered verified coverage.',
  ];
  if (sourceFileCount === 0) {
    notes.push(
      'No source files were scanned. An empty result is not evidence of complete coverage.',
    );
  }
  if (needsHuman.length > 0) {
    const kinds = [...new Set(needsHuman.map((item) => item.kind))].sort().join(', ');
    notes.push(
      `${needsHuman.length} change(s) (${kinds}) have no static call-site mapping and need human review.`,
    );
  }
  if (unresolved.length > 0) {
    const kinds = [...new Set(unresolved.map((item) => item.kind))].sort().join(', ');
    notes.push(
      `${unresolved.length} unresolved site(s) (${kinds}) were recorded, including spread and dynamic arguments.`,
    );
  }
  return notes;
}

function dedupeFindings(findings: ImpactFinding[]): ImpactFinding[] {
  const seen = new Set<string>();
  const result: ImpactFinding[] = [];
  for (const finding of findings) {
    const key = [
      finding.changeId,
      finding.callSite.file,
      finding.callSite.line,
      finding.callSite.column,
      finding.callSite.kind,
      finding.callSite.fieldPath.join('.'),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }
  return result;
}

function dedupeUnresolved(items: UnresolvedItem[]): UnresolvedItem[] {
  const seen = new Set<string>();
  const result: UnresolvedItem[] = [];
  for (const item of items) {
    const key = [item.file, item.line, item.column, item.kind, item.snippet].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function compareFindings(left: ImpactFinding, right: ImpactFinding): number {
  return (
    left.callSite.file.localeCompare(right.callSite.file) ||
    left.callSite.line - right.callSite.line ||
    left.callSite.column - right.callSite.column ||
    left.changeId.localeCompare(right.changeId) ||
    left.callSite.fieldPath.join('.').localeCompare(right.callSite.fieldPath.join('.'))
  );
}

function compareUnresolved(left: UnresolvedItem, right: UnresolvedItem): number {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.kind.localeCompare(right.kind) ||
    left.snippet.localeCompare(right.snippet)
  );
}

async function collectSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (fullPath.endsWith('.d.ts')) continue;
      if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(fullPath);
    }
  };
  await walk(root);
  return files;
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').toLowerCase();
}
