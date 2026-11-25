import { extname, resolve } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
import type { ChangeRecord, ImpactFinding, ImpactReport } from '../domain/types.js';

export class RepoScanner {
  async scan(root: string, changes: ChangeRecord[]): Promise<ImpactReport> {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions: { allowJs: true, target: 99 },
    });
    project.addSourceFilesAtPaths([
      `${root}/**/*.ts`,
      `${root}/**/*.tsx`,
      `${root}/**/*.js`,
      `${root}/**/*.jsx`,
    ]);

    const findings: ImpactFinding[] = [];
    const unverifiedCallSiteCoverage: string[] = [];
    for (const sourceFile of project.getSourceFiles()) {
      const extension = extname(sourceFile.getFilePath());
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(extension)) continue;
      const file = resolve(sourceFile.getFilePath());
      const stripeImport = sourceFile
        .getImportDeclarations()
        .some((item) => item.getModuleSpecifierValue() === 'stripe');
      if (!stripeImport) continue;

      for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expression = call.getExpression();
        const text = expression.getText();
        if (!text.includes('.')) continue;
        const operation = text.split('.').at(-1) ?? text;
        const fieldPaths = call
          .getArguments()
          .flatMap((argument) => this.extractFieldPaths(argument.getText()));

        for (const change of changes) {
          const matchedField = change.path
            ? fieldPaths.find((field) => field.includes(change.path ?? ''))
            : undefined;
          if (matchedField) {
            const pos = call.getStartLinePos();
            const lineAndColumn = sourceFile.getLineAndColumnAtPos(pos);
            findings.push({
              changeId: change.id,
              callSite: {
                file,
                line: lineAndColumn.line,
                column: lineAndColumn.column,
                operation,
                fieldPath: matchedField.split('.'),
                kind: 'sdk_call',
                snippet: call.getText().slice(0, 240),
              },
              confidence: 'high',
              reason: `SDK call field "${change.path}" matches a call argument`,
            });
          }
        }
      }

      for (const property of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
        const text = property.getText();
        for (const change of changes) {
          if (change.path && text.endsWith(change.path)) {
            const pos = property.getStartLinePos();
            const lineAndColumn = sourceFile.getLineAndColumnAtPos(pos);
            findings.push({
              changeId: change.id,
              callSite: {
                file,
                line: lineAndColumn.line,
                column: lineAndColumn.column,
                operation: 'field_access',
                fieldPath: [change.path],
                kind: 'sdk_field',
                snippet: property.getText(),
              },
              confidence: 'medium',
              reason: `Direct field access ends with "${change.path}"`,
            });
          }
        }
      }
    }

    unverifiedCallSiteCoverage.push(
      'Dynamic Stripe SDK calls, reflection, REST fetch calls, generated code, and vendor code are not considered verified coverage.',
    );
    return {
      generatedAt: new Date().toISOString(),
      root,
      changes,
      findings,
      unverifiedCallSiteCoverage,
    };
  }

  private extractFieldPaths(argumentText: string): string[] {
    const identifiers = argumentText.match(/([A-Za-z_$][\w$]*)\s*:/g) ?? [];
    return identifiers
      .map((item) => item.replace(/\s*:\s*$/, '').trim())
      .filter((item, index, all) => all.indexOf(item) === index);
  }
}
