import * as guards from '../scanner/node-guards.js';
import type { NodeLike } from '../scanner/node-guards.js';
import { readdirSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { Project, ScriptKind, ScriptTarget, SyntaxKind, type SourceFile } from 'ts-morph';
import type { ChangeRecord, ImpactReport, NeedsHumanItem } from '../domain/types.js';
import { toPosixPath } from '../util/paths.js';

export type MappingValue = string | null;
export type MappingsFile = Record<string, MappingValue>;

export interface AppliedSuggestion {
  changeId: string;
  kind: 'field_renamed' | 'field_removed';
  file: string;
  line: number;
  before: string;
  after: string;
}

export interface SuggestResult {
  patch: string;
  applied: AppliedSuggestion[];
  needsHuman: NeedsHumanItem[];
  summary: {
    renames: number;
    removals: number;
    needsHuman: number;
    filesChanged: number;
  };
}

export interface SuggestInput {
  root: string;
  impact: ImpactReport;
  mappings: MappingsFile;
}

const ELIGIBLE_CONTEXTS: ReadonlySet<string> = new Set<string>([
  'schema',
  'request_body',
  'response',
  'webhook_event',
]);
const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set<string>(['.ts', '.tsx', '.js', '.jsx']);
const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set<string>([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'vendor',
]);
const CHECKLIST = 'Checklist: [ ] callers; [ ] defaults; [ ] validation; [ ] tests.';
const CONTEXT_LINES = 3;
const MAX_LCS_CELLS = 4_000_000;
const SIMPLE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const SIMPLE_FIELD_PATH = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\[\])*$/;
const GENERATED_FILE_NAME = /(?:\.generated|\.gen|\.g)\.[cm]?[jt]sx?$/i;
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];
const ABSOLUTE_PATH_PATTERN = /[A-Za-z]:[\\/][^\s'"\r\n]+|\/(?:Users|home|var|tmp)\/[^\s'"\r\n]+/g;

interface RenamePlan {
  status: 'rename';
  change: ChangeRecord;
  segments: string[];
  target: string;
}

interface RemovalPlan {
  status: 'removal';
  change: ChangeRecord;
  segments: string[];
}

interface HumanPlan {
  status: 'human';
  change: ChangeRecord;
  reason: string;
}

type Plan = RenamePlan | RemovalPlan | HumanPlan;
type ActivePlan = RenamePlan | RemovalPlan;

interface Edit {
  start: number;
  end: number;
  replacement: string;
  changeId: string;
  appliedKind: AppliedSuggestion['kind'];
  line: number;
  before: string;
  after: string;
}

interface SourceFileEntry {
  absolute: string;
  file: string;
}

interface ChainSegment {
  text: string;
  node: NodeLike;
  owner: NodeLike;
  kind: 'root' | 'property' | 'element';
}

interface LineRemoval {
  start: number;
  end: number;
  before: string;
  line: number;
  suffix: string;
}

interface NeedsHumanDraft {
  item: NeedsHumanItem;
  reasons: string[];
}

type DiffOp = { type: 'equal' | 'remove' | 'add'; value: string };

export function assertMappingsFile(value: unknown, label: string): asserts value is MappingsFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label}: expected an object of field mappings`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const mapping = record[key];
    if (mapping !== null && typeof mapping !== 'string') {
      throw new TypeError(`${label}: each mapping must be a string or null`);
    }
  }
}

export function suggestChanges(input: SuggestInput): SuggestResult {
  if (!Array.isArray(input.impact.changes)) {
    throw new TypeError('impact report must include a changes array');
  }
  assertMappingsFile(input.mappings, 'mappings');

  const root = resolve(input.root);
  const changes = [...input.impact.changes].sort(compareChanges);
  const seenChangeIds = new Set<string>();
  const plans: Plan[] = [];

  for (const change of changes) {
    if (seenChangeIds.has(change.id)) continue;
    seenChangeIds.add(change.id);
    plans.push(buildPlan(change, input.mappings));
  }

  resolveConflicts(plans);

  const drafts = new Map<string, NeedsHumanDraft>();
  const addNeedsHuman = (change: ChangeRecord, reason: string): void => {
    addReason(drafts, change, reason);
  };

  for (const plan of plans) {
    if (plan.status === 'human') addNeedsHuman(plan.change, plan.reason);
  }

  const activePlans = plans.filter((plan): plan is ActivePlan => plan.status !== 'human');
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, target: ScriptTarget.Latest },
  });

  const fileTexts = new Map<string, string>();
  const fileEdits = new Map<string, Edit[]>();
  const droppedChangeIds = new Set<string>();
  const conflictedChangeIds = new Set<string>();

  for (const entry of collectSourceFiles(root)) {
    const text = readFileSync(entry.absolute, 'utf8');
    const sourceFile = project.createSourceFile(entry.file, text, {
      scriptKind: scriptKindFor(entry.file),
    });
    const edits: Edit[] = [];
    for (const plan of activePlans) {
      collectEditsForPlan(sourceFile, text, plan, edits);
    }
    if (edits.length === 0) continue;

    if (isGeneratedFile(entry.file, text)) {
      for (const edit of edits) droppedChangeIds.add(edit.changeId);
      for (const changeId of new Set(edits.map((edit) => edit.changeId))) {
        const change = activePlans.find((plan) => plan.change.id === changeId)?.change;
        if (change) {
          addNeedsHuman(change, `Source file ${entry.file} appears generated and was not patched.`);
        }
      }
      continue;
    }

    if (containsSensitiveMaterial(text)) {
      for (const changeId of new Set(edits.map((edit) => edit.changeId))) {
        const change = activePlans.find((plan) => plan.change.id === changeId)?.change;
        if (change) {
          addNeedsHuman(
            change,
            `Source file ${entry.file} may contain a secret or absolute path and was not patched.`,
          );
          droppedChangeIds.add(changeId);
        }
      }
      continue;
    }

    const selected = selectNonOverlapping(edits);
    for (const edit of selected.conflicted) conflictedChangeIds.add(edit.changeId);
    if (selected.accepted.length === 0) continue;
    fileTexts.set(entry.file, text);
    fileEdits.set(entry.file, selected.accepted);
  }

  const rewritten = new Map<string, { oldText: string; newText: string }>();
  for (const [file, edits] of fileEdits) {
    const oldText = fileTexts.get(file);
    if (oldText === undefined) continue;
    const newText = applyEdits(oldText, edits);
    if (newText !== oldText) rewritten.set(file, { oldText, newText });
  }

  const built = buildPatch(rewritten);
  const applied: AppliedSuggestion[] = [];
  for (const [file, edits] of fileEdits) {
    if (!rewritten.has(file)) continue;
    for (const edit of edits) {
      applied.push({
        changeId: edit.changeId,
        kind: edit.appliedKind,
        file,
        line: edit.line,
        before: redactSensitiveText(edit.before),
        after: redactSensitiveText(edit.after),
      });
    }
  }
  applied.sort(compareApplied);

  const patchedChangeIds = new Set(applied.map((item) => item.changeId));
  for (const plan of activePlans) {
    if (!patchedChangeIds.has(plan.change.id)) {
      addNeedsHuman(
        plan.change,
        'No unambiguous source site matched the explicit mapping; no patch was generated.',
      );
    }
  }
  for (const changeId of conflictedChangeIds) {
    const plan = activePlans.find((candidate) => candidate.change.id === changeId);
    if (plan && patchedChangeIds.has(changeId)) {
      addNeedsHuman(plan.change, 'Some candidate sites overlapped and were not patched.');
    }
  }
  for (const changeId of droppedChangeIds) {
    const plan = activePlans.find((candidate) => candidate.change.id === changeId);
    if (plan) {
      addNeedsHuman(plan.change, 'A candidate source file was skipped; review it manually.');
    }
  }

  const needsHuman = finalizeNeedsHuman(drafts);
  return {
    patch: built.patch,
    applied,
    needsHuman,
    summary: {
      renames: applied.filter((item) => item.kind === 'field_renamed').length,
      removals: applied.filter((item) => item.kind === 'field_removed').length,
      needsHuman: needsHuman.length,
      filesChanged: built.filesChanged,
    },
  };
}

function buildPlan(change: ChangeRecord, mappings: MappingsFile): Plan {
  if (change.context === undefined || !ELIGIBLE_CONTEXTS.has(change.context)) {
    return {
      status: 'human',
      change,
      reason: `Change context ${change.context ?? 'unknown'} is not patchable by the suggest engine.`,
    };
  }
  if (change.path === undefined) {
    return { status: 'human', change, reason: 'Change has no simple field path.' };
  }
  const segments = parseFieldPath(change.path);
  if (segments === undefined) {
    return { status: 'human', change, reason: 'Change path is not a simple field path.' };
  }

  const terminal = segments[segments.length - 1];
  if (terminal === undefined || terminal === '[]') {
    return { status: 'human', change, reason: 'Change path does not end in a field name.' };
  }

  const mapping = lookupMapping(mappings, change.resource, change.path);
  if (!mapping.found) {
    return { status: 'human', change, reason: 'No explicit mapping was found for this change.' };
  }

  if (mapping.value === null) {
    if (change.kind !== 'field_removed') {
      return {
        status: 'human',
        change,
        reason: 'A null mapping is only supported for a removed field.',
      };
    }
    return { status: 'removal', change, segments };
  }

  if (!SIMPLE_IDENTIFIER.test(mapping.value)) {
    return {
      status: 'human',
      change,
      reason: 'Mapping value is not a simple field name.',
    };
  }
  if (mapping.value === terminal) {
    return {
      status: 'human',
      change,
      reason: 'Mapping value does not change the field name.',
    };
  }
  if (!isRenameKind(change.kind)) {
    return {
      status: 'human',
      change,
      reason: `Change kind ${change.kind} does not support a deterministic rename.`,
    };
  }

  return { status: 'rename', change, segments, target: mapping.value };
}

function isRenameKind(kind: ChangeRecord['kind']): boolean {
  return kind === 'field_removed' || kind === 'field_renamed' || kind === 'field_type_changed';
}

function lookupMapping(
  mappings: MappingsFile,
  resource: string,
  path: string,
): { found: false } | { found: true; value: MappingValue } {
  const scopedKey = `${resource}.${path}`;
  if (hasOwn(mappings, scopedKey)) {
    const value = mappings[scopedKey];
    return value === undefined ? { found: false } : { found: true, value };
  }
  if (hasOwn(mappings, path)) {
    const value = mappings[path];
    return value === undefined ? { found: false } : { found: true, value };
  }
  return { found: false };
}

function resolveConflicts(plans: Plan[]): void {
  const byField = new Map<string, ActivePlan[]>();
  for (const plan of plans) {
    if (plan.status === 'human') continue;
    const key = `${plan.change.resource}\u0000${plan.segments.join('.')}`;
    const group = byField.get(key);
    if (group) group.push(plan);
    else byField.set(key, [plan]);
  }

  for (const [key, group] of byField) {
    if (group.length < 2) continue;
    const first = group[0];
    if (first === undefined) continue;
    const consistent = group.every(
      (plan) =>
        plan.status === first.status &&
        (plan.status !== 'rename' || first.status !== 'rename' || plan.target === first.target),
    );
    if (consistent) continue;
    for (const plan of group) {
      const index = plans.indexOf(plan);
      if (index >= 0) {
        plans[index] = {
          status: 'human',
          change: plan.change,
          reason: 'Mappings conflict for the same resource and field.',
        };
      }
    }
    byField.delete(key);
  }
}

function collectEditsForPlan(
  sourceFile: SourceFile,
  text: string,
  plan: ActivePlan,
  edits: Edit[],
): void {
  for (const literal of sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    collectFromObjectLiteral(literal, [], plan, text, edits);
  }
  for (const pattern of sourceFile.getDescendantsOfKind(SyntaxKind.ObjectBindingPattern)) {
    collectFromObjectBinding(pattern, [], plan, text, edits);
  }
  for (const pattern of sourceFile.getDescendantsOfKind(SyntaxKind.ArrayBindingPattern)) {
    collectFromArrayBinding(pattern, [], plan, text, edits);
  }
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    collectFromAccess(access, plan, text, edits);
  }
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    collectFromAccess(access, plan, text, edits);
  }
}

function collectFromObjectLiteral(
  literal: NodeLike,
  prefix: string[],
  plan: ActivePlan,
  text: string,
  edits: Edit[],
): void {
  if (!guards.isObjectLiteralExpression(literal)) return;
  for (const member of literal.getProperties()) {
    let name: string | undefined;
    let nameNode: NodeLike | undefined;
    let value: NodeLike | undefined;
    let shorthandLocal: string | undefined;

    if (guards.isPropertyAssignment(member)) {
      nameNode = member.getNameNode();
      name = propertyNameOf(nameNode);
      value = member.getInitializer();
    } else if (guards.isShorthandPropertyAssignment(member)) {
      nameNode = member.getNameNode();
      name = propertyNameOf(nameNode);
      shorthandLocal = guards.isIdentifier(nameNode) ? nameNode.getText() : undefined;
    } else {
      continue;
    }
    if (name === undefined) continue;

    const segments = [...prefix, name];
    if (segmentsEqual(segments, plan.segments)) {
      if (plan.status === 'rename') {
        const replacement = shorthandLocal
          ? `${plan.target}: ${shorthandLocal}`
          : quotedTarget(nameNode, plan.target);
        pushRenameEdit(edits, text, plan.change.id, nameNode, replacement);
      } else {
        const removal = standaloneLineRemoval(text, member);
        if (removal && canRemoveObjectMember(member, removal)) {
          pushRemovalEdit(edits, plan.change.id, removal);
        }
      }
    }

    if (value === undefined) continue;
    const unwrapped = unwrapExpression(value);
    if (guards.isObjectLiteralExpression(unwrapped)) {
      collectFromObjectLiteral(unwrapped, segments, plan, text, edits);
    } else if (guards.isArrayLiteralExpression(unwrapped)) {
      collectFromArrayLiteral(unwrapped, [...segments, '[]'], plan, text, edits);
    }
  }
}

function collectFromArrayLiteral(
  array: NodeLike,
  prefix: string[],
  plan: ActivePlan,
  text: string,
  edits: Edit[],
): void {
  if (!guards.isArrayLiteralExpression(array)) return;
  for (const element of array.getElements()) {
    const unwrapped = unwrapExpression(element);
    if (guards.isObjectLiteralExpression(unwrapped)) {
      collectFromObjectLiteral(unwrapped, prefix, plan, text, edits);
    } else if (guards.isArrayLiteralExpression(unwrapped)) {
      collectFromArrayLiteral(unwrapped, [...prefix, '[]'], plan, text, edits);
    }
  }
}

function collectFromObjectBinding(
  pattern: NodeLike,
  prefix: string[],
  plan: ActivePlan,
  text: string,
  edits: Edit[],
): void {
  if (!guards.isObjectBindingPattern(pattern)) return;
  for (const element of pattern.getElements()) {
    if (!guards.isBindingElement(element)) continue;
    const propertyNode = element.getPropertyNameNode();
    const nameNode = element.getNameNode();

    let name: string | undefined;
    let targetNode: NodeLike | undefined;
    let localName: string | undefined;
    if (propertyNode !== undefined) {
      name = propertyNameOf(propertyNode);
      targetNode = propertyNode;
    } else if (guards.isIdentifier(nameNode)) {
      name = nameNode.getText();
      targetNode = nameNode;
      localName = nameNode.getText();
    }
    if (name === undefined || targetNode === undefined) continue;

    const segments = [...prefix, name];
    if (segmentsEqual(segments, plan.segments) && plan.status === 'rename') {
      const replacement = localName
        ? `${plan.target}: ${localName}`
        : quotedTarget(targetNode, plan.target);
      pushRenameEdit(edits, text, plan.change.id, targetNode, replacement);
    }
    collectFromBindingName(nameNode, segments, plan, text, edits);
  }
}

function collectFromArrayBinding(
  pattern: NodeLike,
  prefix: string[],
  plan: ActivePlan,
  text: string,
  edits: Edit[],
): void {
  if (!guards.isArrayBindingPattern(pattern)) return;
  for (const element of pattern.getElements()) {
    if (!guards.isBindingElement(element)) continue;
    collectFromBindingName(element.getNameNode(), [...prefix, '[]'], plan, text, edits);
  }
}

function collectFromBindingName(
  name: NodeLike,
  prefix: string[],
  plan: ActivePlan,
  text: string,
  edits: Edit[],
): void {
  if (guards.isObjectBindingPattern(name)) {
    collectFromObjectBinding(name, prefix, plan, text, edits);
  } else if (guards.isArrayBindingPattern(name)) {
    collectFromArrayBinding(name, prefix, plan, text, edits);
  }
}

function collectFromAccess(access: NodeLike, plan: ActivePlan, text: string, edits: Edit[]): void {
  const chain = collectChain(access);
  if (chain === undefined) return;
  const terminal = matchChainSuffix(chain, plan.segments);
  if (terminal === undefined) return;

  if (plan.status === 'rename') {
    const replacement = quotedTarget(terminal.node, plan.target);
    pushRenameEdit(edits, text, plan.change.id, terminal.node, replacement);
    return;
  }

  if (!guards.isExpressionStatement(terminal.owner.getParent())) return;
  const statement = terminal.owner.getParent();
  if (
    statement === undefined ||
    !guards.isExpressionStatement(statement) ||
    statement.getExpression() !== terminal.owner
  ) {
    return;
  }
  const removal = standaloneLineRemoval(text, statement);
  if (removal) pushRemovalEdit(edits, plan.change.id, removal);
}

function collectChain(node: NodeLike): ChainSegment[] | undefined {
  if (guards.isPropertyAccessExpression(node)) {
    const prefix = collectChain(node.getExpression());
    if (prefix === undefined) return undefined;
    return [
      ...prefix,
      {
        text: node.getName(),
        node: node.getNameNode(),
        owner: node,
        kind: 'property',
      },
    ];
  }
  if (guards.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression();
    if (argument === undefined) return undefined;
    let text: string | undefined;
    if (guards.isNumericLiteral(argument)) text = '[]';
    else if (guards.isStringLiteral(argument) || guards.isNoSubstitutionTemplateLiteral(argument)) {
      text = argument.getLiteralValue();
    }
    if (text === undefined) return undefined;
    const prefix = collectChain(node.getExpression());
    if (prefix === undefined) return undefined;
    return [...prefix, { text, node: argument, owner: node, kind: 'element' }];
  }
  if (
    guards.isParenthesizedExpression(node) ||
    guards.isAsExpression(node) ||
    guards.isNonNullExpression(node) ||
    guards.isAwaitExpression(node)
  ) {
    return collectChain(node.getExpression());
  }
  if (guards.isIdentifier(node) || guards.isThisExpression(node)) {
    return [{ text: node.getText(), node, owner: node, kind: 'root' }];
  }
  return undefined;
}

function matchChainSuffix(chain: ChainSegment[], segments: string[]): ChainSegment | undefined {
  if (chain.length < segments.length) return undefined;
  const offset = chain.length - segments.length;
  for (let index = 0; index < segments.length; index += 1) {
    const expected = segments[index];
    const actual = chain[offset + index];
    if (expected === undefined || actual === undefined || actual.text !== expected) {
      return undefined;
    }
  }
  const terminal = chain[chain.length - 1];
  if (terminal === undefined || terminal.kind === 'root') return undefined;
  return terminal;
}

function pushRenameEdit(
  edits: Edit[],
  text: string,
  changeId: string,
  node: NodeLike,
  replacement: string,
): void {
  const start = node.getStart();
  const end = node.getEnd();
  const before = text.slice(start, end);
  if (before === replacement) return;
  edits.push({
    start,
    end,
    replacement,
    changeId,
    appliedKind: 'field_renamed',
    line: lineNumberAt(text, start),
    before: redactSensitiveText(before),
    after: redactSensitiveText(replacement),
  });
}

function pushRemovalEdit(edits: Edit[], changeId: string, removal: LineRemoval): void {
  if (removal.before.length === 0) return;
  edits.push({
    start: removal.start,
    end: removal.end,
    replacement: '',
    changeId,
    appliedKind: 'field_removed',
    line: removal.line,
    before: redactSensitiveText(removal.before),
    after: '',
  });
}

function standaloneLineRemoval(text: string, node: NodeLike): LineRemoval | undefined {
  const start = node.getStart();
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  if (!/^[ \t]*$/.test(text.slice(lineStart, start))) return undefined;

  const newline = text.indexOf('\n', node.getEnd());
  const lineEnd = newline === -1 ? text.length : newline;
  let contentEnd = lineEnd;
  if (contentEnd > lineStart && text[contentEnd - 1] === '\r') contentEnd -= 1;
  const suffix = text.slice(node.getEnd(), contentEnd);
  if (!/^[ \t]*[;,]?[ \t]*$/.test(suffix)) return undefined;

  return {
    start: lineStart,
    end: newline === -1 ? text.length : newline + 1,
    before: text.slice(lineStart, contentEnd).trimEnd(),
    line: lineNumberAt(text, start),
    suffix,
  };
}

function canRemoveObjectMember(member: NodeLike, removal: LineRemoval): boolean {
  const parent = member.getParent();
  if (!guards.isObjectLiteralExpression(parent)) return false;
  if (removal.suffix.includes(',')) return true;
  return parent.getProperties().length === 1;
}

function quotedTarget(node: NodeLike, target: string): string {
  const quote = node.getText()[0];
  if (quote === "'" || quote === '"') return `${quote}${target}${quote}`;
  if (quote === '`') return `\`${target}\``;
  return target;
}

function propertyNameOf(node: NodeLike): string | undefined {
  if (guards.isIdentifier(node)) return node.getText();
  if (guards.isStringLiteral(node) || guards.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralValue();
  }
  if (guards.isNumericLiteral(node)) return node.getText();
  return undefined;
}

function unwrapExpression(node: NodeLike): NodeLike {
  let current = node;
  for (;;) {
    if (
      guards.isParenthesizedExpression(current) ||
      guards.isAsExpression(current) ||
      guards.isNonNullExpression(current) ||
      guards.isAwaitExpression(current)
    ) {
      current = current.getExpression();
      continue;
    }
    return current;
  }
}

function selectNonOverlapping(edits: Edit[]): { accepted: Edit[]; conflicted: Edit[] } {
  const sorted = dedupeEdits(edits).sort(compareEditOrder);
  const accepted: Edit[] = [];
  const conflicted: Edit[] = [];
  let group: Edit[] = [];
  let groupEnd = -1;

  const flush = (): void => {
    if (group.length === 1) {
      const only = group[0];
      if (only) accepted.push(only);
    } else if (group.length > 1) {
      conflicted.push(...group);
    }
    group = [];
    groupEnd = -1;
  };

  for (const edit of sorted) {
    if (group.length > 0 && edit.start < groupEnd) {
      group.push(edit);
      groupEnd = Math.max(groupEnd, edit.end);
    } else {
      flush();
      group = [edit];
      groupEnd = edit.end;
    }
  }
  flush();
  return { accepted, conflicted };
}

function dedupeEdits(edits: Edit[]): Edit[] {
  const seen = new Set<string>();
  const result: Edit[] = [];
  for (const edit of edits) {
    const key = [edit.start, edit.end, edit.replacement, edit.changeId, edit.appliedKind].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edit);
  }
  return result;
}

function applyEdits(text: string, edits: Edit[]): string {
  const sorted = [...edits].sort(compareEditOrder);
  let result = '';
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.start < cursor) continue;
    result += text.slice(cursor, edit.start);
    result += edit.replacement;
    cursor = edit.end;
  }
  return result + text.slice(cursor);
}

function buildPatch(rewritten: Map<string, { oldText: string; newText: string }>): {
  patch: string;
  filesChanged: number;
} {
  const lines: string[] = [];
  let filesChanged = 0;
  for (const file of [...rewritten.keys()].sort(compareStrings)) {
    const content = rewritten.get(file);
    if (content === undefined) continue;
    const hunks = buildUnifiedHunks(splitLines(content.oldText), splitLines(content.newText));
    if (hunks.length === 0) continue;
    filesChanged += 1;
    lines.push(`--- a/${file}`, `+++ b/${file}`, ...hunks);
  }
  return {
    patch: lines.length === 0 ? '' : `${lines.join('\n')}\n`,
    filesChanged,
  };
}

function buildUnifiedHunks(oldLines: string[], newLines: string[]): string[] {
  const ops = diffLines(oldLines, newLines);
  const changed: number[] = [];
  ops.forEach((op, index) => {
    if (op.type !== 'equal') changed.push(index);
  });
  if (changed.length === 0) return [];

  const ranges: Array<{ start: number; end: number }> = [];
  for (const index of changed) {
    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(ops.length - 1, index + CONTEXT_LINES);
    const last = ranges[ranges.length - 1];
    if (last !== undefined && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ start, end });
    }
  }

  const output: string[] = [];
  let oldLine = 1;
  let newLine = 1;
  let position = 0;

  for (const range of ranges) {
    while (position < range.start) {
      const op = ops[position];
      if (op !== undefined) {
        if (op.type !== 'add') oldLine += 1;
        if (op.type !== 'remove') newLine += 1;
      }
      position += 1;
    }

    let oldCount = 0;
    let newCount = 0;
    for (let index = range.start; index <= range.end; index += 1) {
      const op = ops[index];
      if (op === undefined) continue;
      if (op.type !== 'add') oldCount += 1;
      if (op.type !== 'remove') newCount += 1;
    }
    const oldStart = oldCount === 0 ? oldLine - 1 : oldLine;
    const newStart = newCount === 0 ? newLine - 1 : newLine;
    output.push(
      `@@ -${String(oldStart)},${String(oldCount)} +${String(newStart)},${String(newCount)} @@`,
    );

    for (let index = range.start; index <= range.end; index += 1) {
      const op = ops[index];
      if (op === undefined) continue;
      const prefix = op.type === 'equal' ? ' ' : op.type === 'remove' ? '-' : '+';
      output.push(`${prefix}${op.value}`);
      if (op.type !== 'add') oldLine += 1;
      if (op.type !== 'remove') newLine += 1;
    }
    position = range.end + 1;
  }

  return output;
}

function diffLines(oldLines: string[], newLines: string[]): DiffOp[] {
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  if (oldCount === 0 && newCount === 0) return [];

  if (oldCount * newCount > MAX_LCS_CELLS) {
    return [
      ...oldLines.map((value): DiffOp => ({ type: 'remove', value })),
      ...newLines.map((value): DiffOp => ({ type: 'add', value })),
    ];
  }

  const lcs: Uint32Array[] = Array.from(
    { length: oldCount + 1 },
    () => new Uint32Array(newCount + 1),
  );
  for (let i = oldCount - 1; i >= 0; i -= 1) {
    for (let j = newCount - 1; j >= 0; j -= 1) {
      const oldLine = oldLines[i];
      const newLine = newLines[j];
      const row = lcs[i];
      if (row === undefined) throw new Error('LCS row is missing');
      const right = lcs[i + 1]?.[j] ?? 0;
      const down = row[j + 1] ?? 0;
      row[j] = oldLine === newLine ? (lcs[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(right, down);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < oldCount && j < newCount) {
    const oldLine = oldLines[i];
    const newLine = newLines[j];
    if (oldLine === newLine) {
      ops.push({ type: 'equal', value: oldLine ?? '' });
      i += 1;
      j += 1;
      continue;
    }
    const right = lcs[i + 1]?.[j] ?? 0;
    const down = lcs[i]?.[j + 1] ?? 0;
    if (right >= down) {
      ops.push({ type: 'remove', value: oldLine ?? '' });
      i += 1;
    } else {
      ops.push({ type: 'add', value: newLine ?? '' });
      j += 1;
    }
  }
  while (i < oldCount) {
    ops.push({ type: 'remove', value: oldLines[i] ?? '' });
    i += 1;
  }
  while (j < newCount) {
    ops.push({ type: 'add', value: newLines[j] ?? '' });
    j += 1;
  }
  return ops;
}

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function collectSourceFiles(root: string): SourceFileEntry[] {
  const entries: SourceFileEntry[] = [];
  const walk = (directory: string): void => {
    let children: Dirent[];
    try {
      children = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
        compareStrings(left.name, right.name),
      );
    } catch {
      throw new Error('suggest root is not a readable directory');
    }
    for (const child of children) {
      if (child.isSymbolicLink()) continue;
      const absolute = joinPath(directory, child.name);
      if (child.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(child.name)) continue;
        walk(absolute);
        continue;
      }
      if (!child.isFile()) continue;
      if (child.name.endsWith('.d.ts')) continue;
      if (!SOURCE_EXTENSIONS.has(extname(child.name))) continue;
      entries.push({ absolute, file: toPosixPath(relative(root, absolute)) });
    }
  };
  walk(root);
  return entries.sort((left, right) => compareStrings(left.file, right.file));
}

function joinPath(directory: string, name: string): string {
  return `${directory}${directory.endsWith(sep) ? '' : sep}${name}`;
}

function scriptKindFor(file: string): ScriptKind {
  if (file.endsWith('.tsx')) return ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ScriptKind.JSX;
  if (file.endsWith('.js')) return ScriptKind.JS;
  return ScriptKind.TS;
}

function isGeneratedFile(file: string, text: string): boolean {
  const name = file.split('/').pop() ?? file;
  if (GENERATED_FILE_NAME.test(name)) return true;
  const header = text.slice(0, 2000).toLowerCase();
  return (
    header.includes('@generated') ||
    header.includes('generated by') ||
    header.includes('do not edit')
  );
}

function containsSensitiveMaterial(text: string): boolean {
  for (const pattern of [...SENSITIVE_PATTERNS, ABSOLUTE_PATH_PATTERN]) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

function redactSensitiveText(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }
  ABSOLUTE_PATH_PATTERN.lastIndex = 0;
  result = result.replace(ABSOLUTE_PATH_PATTERN, '[REDACTED_PATH]');
  return result;
}

function parseFieldPath(path: string): string[] | undefined {
  if (!SIMPLE_FIELD_PATH.test(path)) return undefined;
  return path.replaceAll('[]', '.[]').split('.').filter(Boolean);
}

function segmentsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function lineNumberAt(text: string, position: number): number {
  let line = 1;
  for (let index = 0; index < position; index += 1) {
    if (text[index] === '\n') line += 1;
  }
  return line;
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function addReason(
  drafts: Map<string, NeedsHumanDraft>,
  change: ChangeRecord,
  reason: string,
): void {
  let draft = drafts.get(change.id);
  if (draft === undefined) {
    draft = {
      item: {
        changeId: change.id,
        kind: change.kind,
        ...(change.context === undefined ? {} : { context: change.context }),
        resource: redactSensitiveText(change.resource),
        ...(change.path === undefined ? {} : { path: redactSensitiveText(change.path) }),
        reason: '',
      },
      reasons: [],
    };
    drafts.set(change.id, draft);
  }
  const clean = redactSensitiveText(reason);
  if (!draft.reasons.includes(clean)) draft.reasons.push(clean);
}

function finalizeNeedsHuman(drafts: Map<string, NeedsHumanDraft>): NeedsHumanItem[] {
  return [...drafts.values()]
    .map((draft) => ({
      ...draft.item,
      reason: `${draft.reasons.join(' ')} ${CHECKLIST}`,
    }))
    .sort((left, right) => compareStrings(left.changeId, right.changeId));
}

function compareChanges(left: ChangeRecord, right: ChangeRecord): number {
  return compareStrings(left.id, right.id);
}

function compareApplied(left: AppliedSuggestion, right: AppliedSuggestion): number {
  return (
    compareStrings(left.file, right.file) ||
    left.line - right.line ||
    compareStrings(left.changeId, right.changeId) ||
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.before, right.before)
  );
}

function compareEditOrder(left: Edit, right: Edit): number {
  return (
    left.start - right.start ||
    right.end - left.end ||
    compareStrings(left.changeId, right.changeId) ||
    compareStrings(left.appliedKind, right.appliedKind)
  );
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
