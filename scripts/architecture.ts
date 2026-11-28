import { posix, relative, sep } from 'node:path';
import {
  Project,
  SyntaxKind,
  type ModifierableNode,
  type ReferencedSymbol,
  type SourceFile,
} from 'ts-morph';

export interface CycleIssue {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly chain: readonly string[];
}

export interface UnusedExportIssue {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly name: string;
}

export interface ArchitectureReport {
  readonly cycles: readonly CycleIssue[];
  readonly unusedExports: readonly UnusedExportIssue[];
}

interface NameNode {
  getText(): string;
  getStart(): number;
  findReferences(): ReferencedSymbol[];
}

interface ExportedName {
  readonly name: string;
  readonly nameNode: NameNode;
}

type FileMap = ReadonlyMap<string, SourceFile>;

export function analyzeArchitecture(): ArchitectureReport {
  const root = process.cwd();
  const project = new Project({
    compilerOptions: { allowJs: true },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  project.addSourceFilesAtPaths(['src/**/*.ts', 'scripts/**/*.ts', 'eslint.config.js']);

  const files = new Map<string, SourceFile>();
  for (const sourceFile of project.getSourceFiles()) {
    const path = toRepoPath(root, sourceFile.getFilePath());
    if (path.startsWith('src/') || path.startsWith('scripts/')) files.set(path, sourceFile);
  }

  const sourcePaths = [...files.keys()].filter(isAnalyzedSourcePath).sort();
  const graph = buildDependencyGraph(sourcePaths, files);
  const cycles = findCycles(graph).map((chain): CycleIssue => {
    const file = chain[0] ?? '';
    const sourceFile = files.get(file);
    const position = sourceFile ? firstImportPosition(sourceFile) : { line: 1, column: 1 };
    return { file, line: position.line, column: position.column, chain };
  });

  const unusedExports: UnusedExportIssue[] = [];
  for (const path of sourcePaths) {
    const sourceFile = files.get(path);
    if (!sourceFile) continue;
    for (const exported of exportedNames(sourceFile)) {
      if (hasReference(exported.nameNode)) continue;
      const position = sourceFile.getLineAndColumnAtPos(exported.nameNode.getStart());
      unusedExports.push({
        file: path,
        line: position.line,
        column: position.column,
        name: exported.name,
      });
    }
  }

  return {
    cycles: cycles.sort((left, right) => compareStrings(left.file, right.file)),
    unusedExports: unusedExports.sort((left, right) => {
      const byFile = compareStrings(left.file, right.file);
      if (byFile !== 0) return byFile;
      return compareStrings(left.name, right.name);
    }),
  };
}

export function formatArchitectureReport(report: ArchitectureReport): string[] {
  const lines: string[] = [];
  for (const cycle of report.cycles) {
    lines.push(
      `${cycle.file}:${String(cycle.line)}:${String(cycle.column)} import cycle: ${cycle.chain.join(' -> ')}`,
    );
  }
  for (const item of report.unusedExports) {
    lines.push(
      `${item.file}:${String(item.line)}:${String(item.column)} unused export: ${item.name}`,
    );
  }
  return lines;
}

function toRepoPath(root: string, filePath: string): string {
  return relative(root, filePath).split(sep).join('/');
}

function isAnalyzedSourcePath(path: string): boolean {
  return (
    (path.startsWith('src/') || path.startsWith('scripts/')) &&
    !path.includes('/fixtures/') &&
    !path.endsWith('.test.ts')
  );
}

function buildDependencyGraph(
  paths: readonly string[],
  files: FileMap,
): ReadonlyMap<string, readonly string[]> {
  const analyzed = new Set(paths);
  const graph = new Map<string, readonly string[]>();
  for (const path of paths) {
    const sourceFile = files.get(path);
    if (!sourceFile) continue;
    const dependencies = new Set<string>();
    for (const declaration of sourceFile.getImportDeclarations()) {
      const target = resolveSpecifier(path, declaration.getModuleSpecifierValue(), files);
      if (target && analyzed.has(target)) dependencies.add(target);
    }
    for (const declaration of sourceFile.getExportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (!specifier) continue;
      const target = resolveSpecifier(path, specifier, files);
      if (target && analyzed.has(target)) dependencies.add(target);
    }
    graph.set(path, [...dependencies].sort());
  }
  return graph;
}

function resolveSpecifier(from: string, specifier: string, files: FileMap): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}/index.ts`];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

function firstImportPosition(sourceFile: SourceFile): {
  readonly line: number;
  readonly column: number;
} {
  const declaration =
    sourceFile.getImportDeclarations()[0] ?? sourceFile.getExportDeclarations()[0];
  return declaration
    ? sourceFile.getLineAndColumnAtPos(declaration.getStart())
    : { line: 1, column: 1 };
}

function findCycles(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  const cycles: string[][] = [];
  const canonical = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function visit(node: string): void {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 'visiting') {
        const start = stack.indexOf(next);
        if (start >= 0) {
          const cycle = [...stack.slice(start), next];
          const key = canonicalCycle(cycle);
          if (!canonical.has(key)) {
            canonical.add(key);
            cycles.push(cycle);
          }
        }
      } else if (!state.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, 'done');
  }

  for (const node of [...graph.keys()].sort()) {
    if (!state.has(node)) visit(node);
  }
  return cycles;
}

function canonicalCycle(cycle: readonly string[]): string {
  const nodes = cycle.slice(0, -1);
  let start = 0;
  for (let index = 1; index < nodes.length; index += 1) {
    if (compareStrings(nodes[index] ?? '', nodes[start] ?? '') < 0) start = index;
  }
  const ordered = [...nodes.slice(start), ...nodes.slice(0, start), nodes[start] ?? ''];
  return ordered.join(' -> ');
}

function exportedNames(sourceFile: SourceFile): ExportedName[] {
  const result: ExportedName[] = [];
  const seen = new Set<string>();

  function add(nameNode: NameNode | undefined): void {
    if (!nameNode) return;
    const name = nameNode.getText();
    if (seen.has(name)) return;
    seen.add(name);
    result.push({ name, nameNode });
  }

  for (const statement of sourceFile.getStatements()) {
    const functionDeclaration = statement.asKind(SyntaxKind.FunctionDeclaration);
    if (functionDeclaration) {
      if (isExported(functionDeclaration)) {
        add(functionDeclaration.getNameNode()?.asKind(SyntaxKind.Identifier));
      }
      continue;
    }
    const classDeclaration = statement.asKind(SyntaxKind.ClassDeclaration);
    if (classDeclaration) {
      if (isExported(classDeclaration)) {
        add(classDeclaration.getNameNode()?.asKind(SyntaxKind.Identifier));
      }
      continue;
    }
    const interfaceDeclaration = statement.asKind(SyntaxKind.InterfaceDeclaration);
    if (interfaceDeclaration) {
      if (isExported(interfaceDeclaration)) {
        add(interfaceDeclaration.getNameNode().asKind(SyntaxKind.Identifier));
      }
      continue;
    }
    const typeAlias = statement.asKind(SyntaxKind.TypeAliasDeclaration);
    if (typeAlias) {
      if (isExported(typeAlias)) add(typeAlias.getNameNode().asKind(SyntaxKind.Identifier));
      continue;
    }
    const enumDeclaration = statement.asKind(SyntaxKind.EnumDeclaration);
    if (enumDeclaration) {
      if (isExported(enumDeclaration)) {
        add(enumDeclaration.getNameNode().asKind(SyntaxKind.Identifier));
      }
      continue;
    }
    const variableStatement = statement.asKind(SyntaxKind.VariableStatement);
    if (variableStatement && isExported(variableStatement)) {
      for (const declaration of variableStatement.getDeclarationList().getDeclarations()) {
        add(declaration.getNameNode().asKind(SyntaxKind.Identifier));
      }
    }
  }

  for (const declaration of sourceFile.getExportDeclarations()) {
    if (declaration.getModuleSpecifierValue()) continue;
    for (const namedExport of declaration.getNamedExports()) {
      add(namedExport.getNameNode().asKind(SyntaxKind.Identifier));
    }
  }
  return result;
}

function isExported(node: ModifierableNode): boolean {
  return node.getModifiers().some((modifier) => modifier.getKind() === SyntaxKind.ExportKeyword);
}

function hasReference(nameNode: NameNode): boolean {
  return nameNode
    .findReferences()
    .some((symbol) => symbol.getReferences().some((entry) => entry.isDefinition() !== true));
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
