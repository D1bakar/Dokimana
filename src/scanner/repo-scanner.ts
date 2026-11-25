import { readdir } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import {
  Node,
  Project,
  SyntaxKind,
  type BindingElement,
  type CallExpression,
  type ObjectLiteralExpression,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph';
import type { ChangeKind, ChangeRecord, ImpactFinding, ImpactReport } from '../domain/types.js';

const STRIPE_MODULE = 'stripe';
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
]);
const INLINE_STRIPE_CLIENT = '<inline-stripe-client>';
const MAX_SNIPPET_LENGTH = 240;
const MAX_REPORTED_DYNAMIC_SITES = 10;

type Confidence = 'high' | 'medium';
type ExtractionIssueKind = 'computed_key' | 'spread' | 'dynamic_argument';

interface ExtractedField {
  segments: string[];
  confidence: Confidence;
}

interface ExtractionIssue {
  kind: ExtractionIssueKind;
  line: number;
}

interface ExtractionResult {
  fields: ExtractedField[];
  issues: ExtractionIssue[];
}

interface FileScanResult {
  findings: ImpactFinding[];
  dynamicSites: string[];
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

    const fieldChanges = changes.filter(
      (change) => FIELD_LEVEL_KINDS.has(change.kind) && change.path !== undefined,
    );
    const unmappedChanges = changes.filter((change) => !FIELD_LEVEL_KINDS.has(change.kind));

    const findings: ImpactFinding[] = [];
    const dynamicSites: string[] = [];
    for (const sourceFile of project.getSourceFiles()) {
      const file = resolve(sourceFile.getFilePath());
      const relativeFile = toPosixPath(relative(repositoryRoot, file));
      const result = new FileScan(sourceFile, file, relativeFile, fieldChanges).run();
      findings.push(...result.findings);
      dynamicSites.push(...result.dynamicSites);
    }

    return {
      generatedAt: new Date().toISOString(),
      root,
      changes,
      findings: dedupeFindings(findings).sort(compareFindings),
      unverifiedCallSiteCoverage: buildCoverageNotes(unmappedChanges, dynamicSites),
    };
  }
}

class FileScan {
  private readonly constructorNames = new Set<string>();
  private readonly clientNames = new Set<string>();
  private readonly derivedNames = new Set<string>();
  private readonly findings: ImpactFinding[] = [];
  private readonly dynamicSites: string[] = [];

  constructor(
    private readonly sourceFile: SourceFile,
    private readonly file: string,
    private readonly relativeFile: string,
    private readonly fieldChanges: ChangeRecord[],
  ) {}

  run(): FileScanResult {
    this.collectConstructorNames();
    if (this.constructorNames.size === 0) return { findings: [], dynamicSites: [] };

    this.collectClientNames();
    if (this.clientNames.size === 0) return { findings: [], dynamicSites: [] };

    this.collectDerivedNames();
    this.scanCalls();
    this.scanPropertyAccess();
    this.scanDestructuredBindings();
    return { findings: this.findings, dynamicSites: this.dynamicSites };
  }

  private collectConstructorNames(): void {
    for (const declaration of this.sourceFile.getImportDeclarations()) {
      if (declaration.getModuleSpecifierValue() !== STRIPE_MODULE) continue;
      const defaultImport = declaration.getDefaultImport();
      if (defaultImport) this.constructorNames.add(defaultImport.getText());
      for (const namedImport of declaration.getNamedImports()) {
        const alias = namedImport.getAliasNode();
        this.constructorNames.add(alias ? alias.getText() : namedImport.getName());
      }
      const namespaceImport = declaration.getNamespaceImport();
      if (namespaceImport) this.constructorNames.add(namespaceImport.getText());
    }

    for (const declaration of allVariableDeclarations(this.sourceFile)) {
      if (!Node.isIdentifier(declaration.getNameNode())) continue;
      const initializer = declaration.getInitializer();
      if (!initializer) continue;
      const value = unwrapExpression(initializer);
      if (Node.isCallExpression(value) && isRequireStripe(value)) {
        this.constructorNames.add(declaration.getName());
      }
    }
  }

  private collectClientNames(): void {
    for (const declaration of allVariableDeclarations(this.sourceFile)) {
      const nameNode = declaration.getNameNode();
      if (!Node.isIdentifier(nameNode)) continue;
      const initializer = declaration.getInitializer();
      if (!initializer) continue;
      if (this.isStripeConstructorCall(unwrapExpression(initializer))) {
        this.clientNames.add(nameNode.getText());
      }
    }

    for (const assignment of this.sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      if (assignment.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
      const left = assignment.getLeft();
      if (!Node.isIdentifier(left)) continue;
      if (this.isStripeConstructorCall(unwrapExpression(assignment.getRight()))) {
        this.clientNames.add(left.getText());
      }
    }
  }

  private collectDerivedNames(): void {
    for (const declaration of allVariableDeclarations(this.sourceFile)) {
      if (!Node.isIdentifier(declaration.getNameNode())) continue;
      const initializer = declaration.getInitializer();
      if (!initializer) continue;
      if (this.containsStripeCall(initializer)) {
        this.derivedNames.add(declaration.getName());
      }
    }
  }

  private scanCalls(): void {
    for (const call of this.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!this.isStripeSdkCall(call)) continue;
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) continue;

      const chain = propertyChain(callee);
      const operation = chain.slice(1).join('.');
      const position = call.getStart();
      const snippet = call.getText().slice(0, MAX_SNIPPET_LENGTH);

      for (const argument of call.getArguments()) {
        const extraction = this.extractArgument(argument);
        for (const issue of extraction.issues) this.recordDynamicSite(issue);
        for (const field of extraction.fields) {
          for (const change of this.fieldChanges) {
            if (!segmentsEqual(field.segments, toPathSegments(change.path ?? ''))) continue;
            this.addFinding({
              change,
              position,
              operation,
              kind: 'sdk_call',
              fieldPath: field.segments,
              confidence: field.confidence,
              snippet,
              reason: `Stripe SDK call "${operation}" sets "${field.segments.join(
                '.',
              )}", which matches the changed field.`,
            });
          }
        }
      }
    }
  }

  private scanPropertyAccess(): void {
    for (const property of this.sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      const parent = property.getParent();
      if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === property) continue;

      const chain = propertyChain(property);
      const root = chain[0];
      if (root === undefined || !this.derivedNames.has(root)) continue;
      const segments = chain.slice(1);
      if (segments.length === 0) continue;

      for (const change of this.fieldChanges) {
        if (!segmentsEqual(segments, toPathSegments(change.path ?? ''))) continue;
        this.addFinding({
          change,
          position: property.getStart(),
          operation: 'field_access',
          kind: 'sdk_field',
          fieldPath: segments,
          confidence: 'medium',
          snippet: property.getText().slice(0, MAX_SNIPPET_LENGTH),
          reason: `Property "${segments.join(
            '.',
          )}" is read from a value returned by a Stripe SDK call and matches the changed field.`,
        });
      }
    }
  }

  private scanDestructuredBindings(): void {
    for (const declaration of allVariableDeclarations(this.sourceFile)) {
      const nameNode = declaration.getNameNode();
      if (!Node.isObjectBindingPattern(nameNode)) continue;
      const initializer = declaration.getInitializer();
      if (!initializer || !this.containsStripeCall(initializer)) continue;

      for (const element of nameNode.getElements()) {
        const name = bindingPropertyName(element);
        if (name === undefined) continue;
        for (const change of this.fieldChanges) {
          if (!segmentsEqual([name], toPathSegments(change.path ?? ''))) continue;
          this.addFinding({
            change,
            position: element.getStart(),
            operation: 'destructured_response',
            kind: 'sdk_field',
            fieldPath: [name],
            confidence: 'medium',
            snippet: element.getText().slice(0, MAX_SNIPPET_LENGTH),
            reason: `Property "${name}" is destructured from a Stripe SDK result and matches the changed field.`,
          });
        }
      }
    }
  }

  private extractArgument(argument: Node): ExtractionResult {
    const value = unwrapExpression(argument);
    if (Node.isSpreadElement(value)) {
      return {
        fields: [],
        issues: [{ kind: 'dynamic_argument', line: value.getStartLineNumber() }],
      };
    }
    if (Node.isObjectLiteralExpression(value)) {
      return extractLiteral(value, 'high');
    }
    if (Node.isIdentifier(value)) {
      const resolved = resolveObjectLiteral(value, this.sourceFile);
      if (resolved) return extractLiteral(resolved, 'medium');
      if (value.getText() === 'undefined') return { fields: [], issues: [] };
      return {
        fields: [],
        issues: [{ kind: 'dynamic_argument', line: value.getStartLineNumber() }],
      };
    }
    if (isPrimitiveLiteral(value)) return { fields: [], issues: [] };
    if (
      Node.isCallExpression(value) ||
      Node.isElementAccessExpression(value) ||
      Node.isPropertyAccessExpression(value) ||
      Node.isNewExpression(value) ||
      Node.isAwaitExpression(value)
    ) {
      return {
        fields: [],
        issues: [{ kind: 'dynamic_argument', line: value.getStartLineNumber() }],
      };
    }
    return { fields: [], issues: [] };
  }

  private isStripeConstructorCall(node: Node): boolean {
    return Node.isNewExpression(node) && this.isStripeConstructor(node.getExpression());
  }

  private isStripeConstructor(node: Node): boolean {
    const text = node.getText();
    for (const name of this.constructorNames) {
      if (text === name || text.startsWith(`${name}.`)) return true;
    }
    return false;
  }

  private isStripeSdkCall(call: CallExpression): boolean {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return false;
    const root = stripeReceiverRoot(callee.getExpression(), this.constructorNames);
    return root !== undefined && (root === INLINE_STRIPE_CLIENT || this.clientNames.has(root));
  }

  private containsStripeCall(node: Node): boolean {
    if (Node.isCallExpression(node) && this.isStripeSdkCall(node)) return true;
    return node
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => this.isStripeSdkCall(call));
  }

  private recordDynamicSite(issue: ExtractionIssue): void {
    const label = issue.kind.replaceAll('_', ' ');
    this.dynamicSites.push(`${this.relativeFile}:${issue.line} (${label})`);
  }

  private addFinding(input: {
    change: ChangeRecord;
    position: number;
    operation: string;
    kind: ImpactFinding['callSite']['kind'];
    fieldPath: string[];
    confidence: Confidence;
    snippet: string;
    reason: string;
  }): void {
    const { line, column } = this.sourceFile.getLineAndColumnAtPos(input.position);
    this.findings.push({
      changeId: input.change.id,
      callSite: {
        file: this.file,
        line,
        column,
        operation: input.operation,
        fieldPath: [...input.fieldPath],
        kind: input.kind,
        snippet: input.snippet,
      },
      confidence: input.confidence,
      reason: input.reason,
    });
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
      issues.push({ kind: 'spread', line: property.getStartLineNumber() });
      continue;
    }

    let name: string | undefined;
    let value: Node | undefined;
    if (Node.isPropertyAssignment(property)) {
      const nameNode = property.getNameNode();
      if (Node.isComputedPropertyName(nameNode)) {
        issues.push({ kind: 'computed_key', line: property.getStartLineNumber() });
        continue;
      }
      name = propertyName(nameNode);
      value = property.getInitializer();
    } else if (Node.isShorthandPropertyAssignment(property)) {
      name = property.getName();
    } else {
      continue;
    }
    if (name === undefined) continue;

    const segments = [...prefix, name];
    fields.push({ segments, confidence });
    if (value === undefined) continue;

    const unwrapped = unwrapExpression(value);
    if (Node.isObjectLiteralExpression(unwrapped)) {
      extractFields(unwrapped, confidence, segments, fields, issues);
      continue;
    }
    if (Node.isArrayLiteralExpression(unwrapped)) {
      fields.push({ segments: [...segments, '[]'], confidence });
      for (const element of unwrapped.getElements()) {
        const item = unwrapExpression(element);
        if (Node.isObjectLiteralExpression(item)) {
          extractFields(item, confidence, [...segments, '[]'], fields, issues);
        }
      }
    }
  }
}

function resolveObjectLiteral(
  expression: Node,
  sourceFile: SourceFile,
  seen: Set<string> = new Set<string>(),
): ObjectLiteralExpression | undefined {
  const value = unwrapExpression(expression);
  if (Node.isObjectLiteralExpression(value)) return value;
  if (!Node.isIdentifier(value)) return undefined;

  const name = value.getText();
  if (seen.has(name)) return undefined;
  seen.add(name);

  const declaration = allVariableDeclarations(sourceFile).find(
    (candidate) => candidate.getName() === name,
  );
  const initializer = declaration?.getInitializer();
  if (!initializer) return undefined;
  return resolveObjectLiteral(initializer, sourceFile, seen);
}

function stripeReceiverRoot(node: Node, constructorNames: Set<string>): string | undefined {
  let current: Node = node;
  for (;;) {
    if (
      Node.isPropertyAccessExpression(current) ||
      Node.isElementAccessExpression(current) ||
      Node.isCallExpression(current) ||
      Node.isNonNullExpression(current) ||
      Node.isParenthesizedExpression(current) ||
      Node.isAwaitExpression(current)
    ) {
      current = current.getExpression();
      continue;
    }
    if (
      Node.isNewExpression(current) &&
      isStripeConstructorText(current.getExpression(), constructorNames)
    ) {
      return INLINE_STRIPE_CLIENT;
    }
    if (Node.isIdentifier(current)) return current.getText();
    return undefined;
  }
}

function isStripeConstructorText(node: Node, constructorNames: Set<string>): boolean {
  const text = node.getText();
  for (const name of constructorNames) {
    if (text === name || text.startsWith(`${name}.`)) return true;
  }
  return false;
}

function propertyChain(node: Node): string[] {
  const segments: string[] = [];
  let current: Node = node;
  while (Node.isPropertyAccessExpression(current)) {
    segments.unshift(current.getName());
    current = current.getExpression();
  }
  if (Node.isIdentifier(current) || Node.isThisExpression(current)) {
    segments.unshift(current.getText());
  }
  return segments;
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

function unwrapExpression(node: Node): Node {
  let current: Node = node;
  for (;;) {
    if (
      Node.isParenthesizedExpression(current) ||
      Node.isAsExpression(current) ||
      Node.isNonNullExpression(current) ||
      Node.isAwaitExpression(current)
    ) {
      current = current.getExpression();
      continue;
    }
    return current;
  }
}

function isRequireStripe(call: CallExpression): boolean {
  const expression = call.getExpression();
  if (!Node.isIdentifier(expression) || expression.getText() !== 'require') return false;
  const [argument] = call.getArguments();
  return (
    argument !== undefined &&
    Node.isStringLiteral(argument) &&
    argument.getLiteralValue() === STRIPE_MODULE
  );
}

function isPrimitiveLiteral(node: Node): boolean {
  return (
    Node.isStringLiteral(node) ||
    Node.isNumericLiteral(node) ||
    Node.isBigIntLiteral(node) ||
    Node.isTrueLiteral(node) ||
    Node.isFalseLiteral(node) ||
    Node.isNullLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node) ||
    Node.isRegularExpressionLiteral(node) ||
    Node.isArrayLiteralExpression(node)
  );
}

function allVariableDeclarations(sourceFile: SourceFile): VariableDeclaration[] {
  return sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
}

function toPathSegments(path: string): string[] {
  return path.replaceAll('[]', '.[]').split('.').filter(Boolean);
}

function segmentsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
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

function compareFindings(left: ImpactFinding, right: ImpactFinding): number {
  return (
    left.callSite.file.localeCompare(right.callSite.file) ||
    left.callSite.line - right.callSite.line ||
    left.callSite.column - right.callSite.column ||
    left.changeId.localeCompare(right.changeId) ||
    left.callSite.fieldPath.join('.').localeCompare(right.callSite.fieldPath.join('.'))
  );
}

function buildCoverageNotes(changes: ChangeRecord[], dynamicSites: string[]): string[] {
  const notes = [
    'Dynamic Stripe SDK calls, reflection, REST fetch calls, generated code, and vendor code are not considered verified coverage.',
  ];

  if (changes.length > 0) {
    const kinds = [...new Set(changes.map((change) => change.kind))].sort().join(', ');
    notes.push(
      `${changes.length} change(s) (${kinds}) are resource-level and cannot be mapped to call sites from static AST analysis.`,
    );
  }

  if (dynamicSites.length > 0) {
    const uniqueSites = [...new Set(dynamicSites)].sort();
    const shown = uniqueSites.slice(0, MAX_REPORTED_DYNAMIC_SITES);
    const remainder = uniqueSites.length - shown.length;
    notes.push(
      `Dynamic or spread Stripe SDK arguments were not analyzed at ${shown.join(', ')}${
        remainder > 0 ? ` and ${remainder} more site(s)` : ''
      }.`,
    );
  }

  return notes;
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

function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}
