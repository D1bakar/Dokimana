import { dirname, resolve } from 'node:path';
import { Node, Project, SyntaxKind, type SourceFile } from 'ts-morph';

export type StripeSymbolKind = 'client' | 'resource' | 'event';

export interface StripeSymbol {
  kind: StripeSymbolKind;
  resource?: string;
}

export interface ExportedSymbol {
  source?: string;
  name: string;
}

export interface SourceFacts {
  sourceFile: SourceFile;
  constructorNames: Set<string>;
  clientNames: Set<string>;
  typedNames: Map<string, string>;
  webhookNames: Set<string>;
  typeAliases: Set<string>;
  typeGuardEvents: Map<string, string>;
  exportedClients: Map<string, ExportedSymbol>;
  exportedTyped: Map<string, ExportedSymbol>;
  exportedWebhooks: Map<string, ExportedSymbol>;
  exportedGuards: Map<string, ExportedSymbol>;
  unresolvedImports: string[];
}

const EVENT_TYPE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$/;

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').toLowerCase();
}

function identifierName(node: Node): string | undefined {
  return Node.isIdentifier(node) ? node.getText() : undefined;
}

function declaredType(node: Node): string {
  const parts: string[] = [];
  if (
    Node.isVariableDeclaration(node) ||
    Node.isParameterDeclaration(node) ||
    Node.isPropertyDeclaration(node)
  ) {
    const typeNode = node.getTypeNode();
    if (typeNode) parts.push(typeNode.getText());
  }
  for (const comment of node.getLeadingCommentRanges()) {
    parts.push(comment.getText());
  }
  try {
    parts.push(node.getType().getText(node));
  } catch {
    // A type checker failure is not fatal; textual annotation evidence still applies.
  }
  return parts.join(' ');
}

function classifyType(text: string, aliases: ReadonlySet<string>): StripeSymbol | undefined {
  const normalized = text.replace(/\s+/g, ' ');
  const resource = normalized.match(/Stripe\.([A-Z]\w*)/)?.[1];
  if (resource) return { kind: resource === 'Event' ? 'event' : 'resource', resource };
  if (/\bStripe\b/.test(normalized)) return { kind: 'client' };
  for (const alias of aliases) {
    if (new RegExp(`\\b${alias}\\b`).test(normalized)) return { kind: 'client' };
  }
  return undefined;
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

function isRequireStripe(node: Node): boolean {
  if (!Node.isCallExpression(node)) return false;
  const expression = node.getExpression();
  if (!Node.isIdentifier(expression) || expression.getText() !== 'require') return false;
  const [argument] = node.getArguments();
  return (
    argument !== undefined &&
    Node.isStringLiteral(argument) &&
    argument.getLiteralValue() === 'stripe'
  );
}

function isStripeConstructor(node: Node, constructorNames: ReadonlySet<string>): boolean {
  const value = unwrap(node);
  if (!Node.isNewExpression(value)) return false;
  const text = value.getExpression().getText();
  return [...constructorNames].some((name) => text === name || text.startsWith(`${name}.`));
}

function isConstructEventCall(node: Node): boolean {
  const value = unwrap(node);
  return Node.isCallExpression(value) && value.getExpression().getText().endsWith('.constructEvent');
}

function importBindings(declaration: Node): Array<{ imported: string; local: string }> {
  if (!Node.isImportDeclaration(declaration)) return [];
  const bindings: Array<{ imported: string; local: string }> = [];
  const defaultImport = declaration.getDefaultImport();
  if (defaultImport) bindings.push({ imported: 'default', local: defaultImport.getText() });
  const namespaceImport = declaration.getNamespaceImport();
  if (namespaceImport) bindings.push({ imported: '*', local: namespaceImport.getText() });
  for (const named of declaration.getNamedImports()) {
    const alias = named.getAliasNode();
    bindings.push({ imported: named.getName(), local: alias ? alias.getText() : named.getName() });
  }
  return bindings;
}

function exportSpecifier(specifier: Node): { local: string; exported: string } {
  const nameNode = specifier.getNameNode();
  const local = nameNode.getText();
  const alias = specifier.getAliasNode()?.getText();
  return { local, exported: alias ?? local };
}

function resolveImportSource(
  project: Project,
  sourceFile: SourceFile,
  specifier: string,
): SourceFile | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(sourceFile.getFilePath()), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
    resolve(base, 'index.js'),
  ];
  if (/\.[cm]?jsx?$/i.test(base)) {
    const stem = base.replace(/\.[cm]?jsx?$/i, '');
    candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}.jsx`);
  }
  for (const candidate of candidates) {
    const found = project.getSourceFile(
      (file) => normalizePath(file.getFilePath()) === normalizePath(candidate),
    );
    if (found) return found;
  }
  return undefined;
}

function copySymbol(
  name: string,
  from: Map<string, ExportedSymbol>,
  to: Map<string, ExportedSymbol>,
): void {
  const symbol = from.get(name);
  if (symbol) to.set(name, symbol);
}

function collectLocalFacts(fact: SourceFacts): void {
  const sourceFile = fact.sourceFile;

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== 'stripe') continue;
    for (const binding of importBindings(declaration)) {
      fact.constructorNames.add(binding.local);
    }
  }

  for (const assignment of sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (assignment.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
    if (!isRequireStripe(assignment.getRight())) continue;
    const name = identifierName(assignment.getLeft());
    if (name) fact.constructorNames.add(name);
  }

  for (const alias of sourceFile.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration)) {
    const text = alias.getTypeNode()?.getText() ?? '';
    if (/\bStripe\b/.test(text)) fact.typeAliases.add(alias.getName());
  }

  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const name = identifierName(declaration.getNameNode());
    if (!name) continue;
    const type = classifyType(declaredType(declaration), fact.typeAliases);
    if (type?.kind === 'client') fact.clientNames.add(name);
    if (type?.kind === 'resource' && type.resource) fact.typedNames.set(name, type.resource);
    if (type?.kind === 'event') {
      fact.typedNames.set(name, 'Event');
      fact.webhookNames.add(name);
    }
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    if (isStripeConstructor(initializer, fact.constructorNames)) fact.clientNames.add(name);
    if (isConstructEventCall(initializer)) {
      fact.webhookNames.add(name);
      fact.typedNames.set(name, 'Event');
    }
  }

  for (const parameter of sourceFile.getDescendantsOfKind(SyntaxKind.ParameterDeclaration)) {
    const name = identifierName(parameter.getNameNode());
    if (!name) continue;
    const type = classifyType(declaredType(parameter), fact.typeAliases);
    if (type?.kind === 'client') {
      fact.clientNames.add(name);
      if (
        parameter.hasModifier(SyntaxKind.PrivateKeyword) ||
        parameter.hasModifier(SyntaxKind.ProtectedKeyword) ||
        parameter.hasModifier(SyntaxKind.PublicKeyword) ||
        parameter.hasModifier(SyntaxKind.ReadonlyKeyword)
      ) {
        fact.clientNames.add(`this.${name}`);
      }
    }
    if (type?.kind === 'resource' && type.resource) fact.typedNames.set(name, type.resource);
    if (type?.kind === 'event') {
      fact.typedNames.set(name, 'Event');
      fact.webhookNames.add(name);
    }
  }

  for (const property of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyDeclaration)) {
    const name = identifierName(property.getNameNode());
    if (!name) continue;
    const type = classifyType(declaredType(property), fact.typeAliases);
    const qualified = `this.${name}`;
    if (type?.kind === 'client') fact.clientNames.add(qualified);
    if (type?.kind === 'resource' && type.resource) fact.typedNames.set(qualified, type.resource);
    if (type?.kind === 'event') {
      fact.typedNames.set(qualified, 'Event');
      fact.webhookNames.add(qualified);
    }
  }

  for (const func of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = func.getName();
    if (!name) continue;
    const body = func.getBody();
    if (!body) continue;
    const parameter = func.getParameters()[0];
    if (!parameter || !/Stripe\.Event|\bEvent\b/.test(declaredType(parameter))) continue;
    const eventType = body
      .getDescendantsOfKind(SyntaxKind.StringLiteral)
      .map((literal) => literal.getLiteralValue())
      .find((value) => EVENT_TYPE.test(value));
    if (eventType) fact.typeGuardEvents.set(name, eventType);
  }

  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const name = identifierName(declaration.getNameNode());
    if (!name) continue;
    const statement = declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement);
    if (!statement?.hasExportKeyword()) continue;
    if (fact.clientNames.has(name)) fact.exportedClients.set(name, { name });
    const resource = fact.typedNames.get(name);
    if (resource) fact.exportedTyped.set(name, { name });
    if (fact.webhookNames.has(name)) fact.exportedWebhooks.set(name, { name });
  }

  for (const func of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = func.getName();
    if (!name || !func.hasExportKeyword()) continue;
    const eventType = fact.typeGuardEvents.get(name);
    if (eventType) fact.exportedGuards.set(name, { name });
  }

  for (const declaration of sourceFile.getExportDeclarations()) {
    const source = declaration.getModuleSpecifier()?.getLiteralValue();
    for (const specifier of declaration.getNamedExports()) {
      const { local, exported } = exportSpecifier(specifier);
      if (source === undefined) {
        if (fact.clientNames.has(local)) fact.exportedClients.set(exported, { name: local });
        const resource = fact.typedNames.get(local);
        if (resource) fact.exportedTyped.set(exported, { name: local });
        if (fact.webhookNames.has(local)) fact.exportedWebhooks.set(exported, { name: local });
        const guard = fact.typeGuardEvents.get(local);
        if (guard) fact.exportedGuards.set(exported, { name: local });
        continue;
      }
      const remote: ExportedSymbol = { name: local, source };
      fact.exportedClients.set(exported, remote);
      fact.exportedTyped.set(exported, remote);
      fact.exportedWebhooks.set(exported, remote);
      fact.exportedGuards.set(exported, remote);
    }
  }
}

function applyImports(project: Project, facts: Map<string, SourceFacts>): void {
  for (const fact of facts.values()) {
    for (const declaration of fact.sourceFile.getImportDeclarations()) {
      const moduleSpecifier = declaration.getModuleSpecifierValue();
      const targetFile = resolveImportSource(project, fact.sourceFile, moduleSpecifier);
      if (!targetFile) {
        if (moduleSpecifier.startsWith('.') || /stripe/i.test(moduleSpecifier)) {
          fact.unresolvedImports.push(moduleSpecifier);
        }
        continue;
      }
      const target = facts.get(normalizePath(targetFile.getFilePath()));
      if (!target) continue;
      for (const binding of importBindings(declaration)) {
        if (target.exportedClients.has(binding.imported)) fact.clientNames.add(binding.local);
        const resource = target.exportedTyped.get(binding.imported);
        if (resource) {
          const value = target.typedNames.get(resource.name) ?? 'unknown';
          fact.typedNames.set(binding.local, value);
        }
        if (target.exportedWebhooks.has(binding.imported)) {
          fact.webhookNames.add(binding.local);
          fact.typedNames.set(binding.local, 'Event');
        }
        const guard = target.exportedGuards.get(binding.imported);
        if (guard) {
          const eventType = target.typeGuardEvents.get(guard.name);
          if (eventType) fact.typeGuardEvents.set(binding.local, eventType);
        }
      }
    }
  }
}

function applyReexports(project: Project, facts: Map<string, SourceFacts>): void {
  for (let pass = 0; pass < 3; pass += 1) {
    for (const fact of facts.values()) {
      for (const [exported, symbol] of fact.exportedClients) {
        if (symbol.source === undefined) continue;
        const target = resolveRemote(project, facts, fact, symbol);
        if (target?.exportedClients.has(symbol.name)) {
          fact.exportedClients.set(exported, { name: symbol.name });
        }
      }
      for (const [exported, symbol] of fact.exportedTyped) {
        if (symbol.source === undefined) continue;
        const target = resolveRemote(project, facts, fact, symbol);
        if (!target) continue;
        const value = copyRemoteValue(target, symbol.name);
        if (value !== undefined) {
          fact.exportedTyped.set(exported, { name: value });
        }
      }
      for (const [exported, symbol] of fact.exportedWebhooks) {
        if (symbol.source === undefined) continue;
        const target = resolveRemote(project, facts, fact, symbol);
        if (target?.exportedWebhooks.has(symbol.name)) {
          fact.exportedWebhooks.set(exported, { name: symbol.name });
        }
      }
      for (const [exported, symbol] of fact.exportedGuards) {
        if (symbol.source === undefined) continue;
        const target = resolveRemote(project, facts, fact, symbol);
        if (target?.exportedGuards.has(symbol.name)) {
          fact.exportedGuards.set(exported, { name: symbol.name });
        }
      }
    }
  }
}

function resolveRemote(
  project: Project,
  facts: Map<string, SourceFacts>,
  fact: SourceFacts,
  symbol: ExportedSymbol,
): SourceFacts | undefined {
  if (symbol.source === undefined) return undefined;
  const file = resolveImportSource(project, fact.sourceFile, symbol.source);
  return file ? facts.get(normalizePath(file.getFilePath())) : undefined;
}

function copyRemoteValue(target: SourceFacts, name: string): string | undefined {
  const exported = target.exportedTyped.get(name);
  if (exported) return target.typedNames.get(exported.name);
  return target.typedNames.get(name);
}

export function buildProjectIndex(project: Project): Map<string, SourceFacts> {
  const facts = new Map<string, SourceFacts>();
  const sourceFiles = [...project.getSourceFiles()].sort((left, right) =>
    left.getFilePath().localeCompare(right.getFilePath()),
  );

  for (const sourceFile of sourceFiles) {
    const fact: SourceFacts = {
      sourceFile,
      constructorNames: new Set<string>(),
      clientNames: new Set<string>(),
      typedNames: new Map<string, string>(),
      webhookNames: new Set<string>(),
      typeAliases: new Set<string>(),
      typeGuardEvents: new Map<string, string>(),
      exportedClients: new Map<string, ExportedSymbol>(),
      exportedTyped: new Map<string, ExportedSymbol>(),
      exportedWebhooks: new Map<string, ExportedSymbol>(),
      exportedGuards: new Map<string, ExportedSymbol>(),
      unresolvedImports: [],
    };
    collectLocalFacts(fact);
    facts.set(normalizePath(sourceFile.getFilePath()), fact);
  }

  applyReexports(project, facts);
  applyImports(project, facts);
  return facts;
}
