import { SyntaxKind } from 'ts-morph';
import type {
  ArrayBindingPattern,
  ArrayLiteralExpression,
  AsExpression,
  AwaitExpression,
  BigIntLiteral,
  BindingElement,
  CallExpression,
  CaseClause,
  ComputedPropertyName,
  ElementAccessExpression,
  ExpressionStatement,
  FalseLiteral,
  Identifier,
  ImportDeclaration,
  NewExpression,
  NoSubstitutionTemplateLiteral,
  NonNullExpression,
  NullLiteral,
  NumericLiteral,
  ObjectBindingPattern,
  ObjectLiteralExpression,
  ParameterDeclaration,
  ParenthesizedExpression,
  PropertyAccessExpression,
  PropertyAssignment,
  PropertyDeclaration,
  SatisfiesExpression,
  ShorthandPropertyAssignment,
  SpreadAssignment,
  SpreadElement,
  StringLiteral,
  ThisExpression,
  TrueLiteral,
  VariableDeclaration,
  Node,
} from 'ts-morph';

/** Structural view of a ts-morph node that avoids nominal class assignment checks. */
export type NodeLike = Pick<Node, keyof Node>;

export function isArrayBindingPattern(node: NodeLike | undefined): node is ArrayBindingPattern {
  return node?.asKind(SyntaxKind.ArrayBindingPattern) !== undefined;
}

export function isArrayLiteralExpression(
  node: NodeLike | undefined,
): node is ArrayLiteralExpression {
  return node?.asKind(SyntaxKind.ArrayLiteralExpression) !== undefined;
}

export function isAsExpression(node: NodeLike | undefined): node is AsExpression {
  return node?.asKind(SyntaxKind.AsExpression) !== undefined;
}

export function isAwaitExpression(node: NodeLike | undefined): node is AwaitExpression {
  return node?.asKind(SyntaxKind.AwaitExpression) !== undefined;
}

export function isBigIntLiteral(node: NodeLike | undefined): node is BigIntLiteral {
  return node?.asKind(SyntaxKind.BigIntLiteral) !== undefined;
}

export function isBindingElement(node: NodeLike | undefined): node is BindingElement {
  return node?.asKind(SyntaxKind.BindingElement) !== undefined;
}

export function isCallExpression(node: NodeLike | undefined): node is CallExpression {
  return node?.asKind(SyntaxKind.CallExpression) !== undefined;
}

export function isCaseClause(node: NodeLike | undefined): node is CaseClause {
  return node?.asKind(SyntaxKind.CaseClause) !== undefined;
}

export function isComputedPropertyName(node: NodeLike | undefined): node is ComputedPropertyName {
  return node?.asKind(SyntaxKind.ComputedPropertyName) !== undefined;
}

export function isElementAccessExpression(
  node: NodeLike | undefined,
): node is ElementAccessExpression {
  return node?.asKind(SyntaxKind.ElementAccessExpression) !== undefined;
}

export function isExpressionStatement(node: NodeLike | undefined): node is ExpressionStatement {
  return node?.asKind(SyntaxKind.ExpressionStatement) !== undefined;
}

export function isFalseLiteral(node: NodeLike | undefined): node is FalseLiteral {
  return node?.asKind(SyntaxKind.FalseKeyword) !== undefined;
}

export function isIdentifier(node: NodeLike | undefined): node is Identifier {
  return node?.asKind(SyntaxKind.Identifier) !== undefined;
}

export function isImportDeclaration(node: NodeLike | undefined): node is ImportDeclaration {
  return node?.asKind(SyntaxKind.ImportDeclaration) !== undefined;
}

export function isNewExpression(node: NodeLike | undefined): node is NewExpression {
  return node?.asKind(SyntaxKind.NewExpression) !== undefined;
}

export function isNonNullExpression(node: NodeLike | undefined): node is NonNullExpression {
  return node?.asKind(SyntaxKind.NonNullExpression) !== undefined;
}

export function isNoSubstitutionTemplateLiteral(
  node: NodeLike | undefined,
): node is NoSubstitutionTemplateLiteral {
  return node?.asKind(SyntaxKind.NoSubstitutionTemplateLiteral) !== undefined;
}

export function isNullLiteral(node: NodeLike | undefined): node is NullLiteral {
  return node?.asKind(SyntaxKind.NullKeyword) !== undefined;
}

export function isNumericLiteral(node: NodeLike | undefined): node is NumericLiteral {
  return node?.asKind(SyntaxKind.NumericLiteral) !== undefined;
}

export function isObjectBindingPattern(node: NodeLike | undefined): node is ObjectBindingPattern {
  return node?.asKind(SyntaxKind.ObjectBindingPattern) !== undefined;
}

export function isObjectLiteralExpression(
  node: NodeLike | undefined,
): node is ObjectLiteralExpression {
  return node?.asKind(SyntaxKind.ObjectLiteralExpression) !== undefined;
}

export function isParameterDeclaration(node: NodeLike | undefined): node is ParameterDeclaration {
  return node?.asKind(SyntaxKind.Parameter) !== undefined;
}

export function isParenthesizedExpression(
  node: NodeLike | undefined,
): node is ParenthesizedExpression {
  return node?.asKind(SyntaxKind.ParenthesizedExpression) !== undefined;
}

export function isPropertyAccessExpression(
  node: NodeLike | undefined,
): node is PropertyAccessExpression {
  return node?.asKind(SyntaxKind.PropertyAccessExpression) !== undefined;
}

export function isPropertyAssignment(node: NodeLike | undefined): node is PropertyAssignment {
  return node?.asKind(SyntaxKind.PropertyAssignment) !== undefined;
}

export function isPropertyDeclaration(node: NodeLike | undefined): node is PropertyDeclaration {
  return node?.asKind(SyntaxKind.PropertyDeclaration) !== undefined;
}

export function isSatisfiesExpression(node: NodeLike | undefined): node is SatisfiesExpression {
  return node?.asKind(SyntaxKind.SatisfiesExpression) !== undefined;
}

export function isShorthandPropertyAssignment(
  node: NodeLike | undefined,
): node is ShorthandPropertyAssignment {
  return node?.asKind(SyntaxKind.ShorthandPropertyAssignment) !== undefined;
}

export function isSpreadAssignment(node: NodeLike | undefined): node is SpreadAssignment {
  return node?.asKind(SyntaxKind.SpreadAssignment) !== undefined;
}

export function isSpreadElement(node: NodeLike | undefined): node is SpreadElement {
  return node?.asKind(SyntaxKind.SpreadElement) !== undefined;
}

export function isStringLiteral(node: NodeLike | undefined): node is StringLiteral {
  return node?.asKind(SyntaxKind.StringLiteral) !== undefined;
}

export function isThisExpression(node: NodeLike | undefined): node is ThisExpression {
  return node?.asKind(SyntaxKind.ThisKeyword) !== undefined;
}

export function isTrueLiteral(node: NodeLike | undefined): node is TrueLiteral {
  return node?.asKind(SyntaxKind.TrueKeyword) !== undefined;
}

export function isVariableDeclaration(node: NodeLike | undefined): node is VariableDeclaration {
  return node?.asKind(SyntaxKind.VariableDeclaration) !== undefined;
}
