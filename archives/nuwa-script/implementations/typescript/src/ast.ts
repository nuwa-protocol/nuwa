import { JsonValue } from './values.js'; // Import JsonValue

/**
 * Represents the different types of runtime values NuwaScript deals with.
 * This is defined more concretely in values.ts, but needed here for Literal types.
 */
// Remove NuwaValue definition here
/*
export type NuwaValue =
  | string
  | number
  | boolean
  | null
  | NuwaValue[]
  | { [key: string]: NuwaValue };
*/

// --- Base Nodes ---

export interface BaseNode {
  // Optional: Add location info (start/end line/column) from parser later
  // location?: { start: Position, end: Position };
}

// --- Expressions ---

export type Expression =
  | LiteralExpr
  | VariableExpr
  | BinaryOpExpr
  | UnaryOpExpr
  | FunctionCallExpr
  | ToolCallExpr
  | ArrayIndexExpression
  | MemberAccessExpr
  | ListLiteralExpr
  | ObjectLiteralExpr;
  // | CalcExpr; // Removed CALC

export interface LiteralExpr extends BaseNode {
  kind: 'LiteralExpr';
  value: JsonValue;
}

export interface VariableExpr extends BaseNode {
  kind: 'VariableExpr';
  name: string; // Can be simple "x" or dotted "obj.prop"
}

export type BinaryOperator =
  | '==' | '!=' | '>' | '<' | '>=' | '<='
  | 'AND' | 'OR'
  | '+' | '-' | '*' | '/' | '%'; // Add arithmetic and modulo

export interface BinaryOpExpr extends BaseNode {
  kind: 'BinaryOpExpr';
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

export type UnaryOperator = 'NOT' | '+' | '-'; // Add PLUS and MINUS

export interface UnaryOpExpr extends BaseNode {
  kind: 'UnaryOpExpr';
  operator: UnaryOperator;
  operand: Expression;
}

// export type BuiltinFunctionName = 'NOW'; // Remove this specific type

export interface FunctionCallExpr extends BaseNode {
  kind: 'FunctionCallExpr';
  functionName: string; // Allow any function name
  arguments: Expression[]; // Add arguments array
}

// Represents CALL tool { ... } used as an expression
export interface ToolCallExpr extends BaseNode {
  kind: 'ToolCallExpr';
  toolName: string;
  arguments: Record<string, Expression>; // Map arg name to its expression
}

// Add the new ArrayIndexExpression interface
export interface ArrayIndexExpression extends BaseNode {
  kind: 'ArrayIndexExpression';
  object: Expression; // The expression being indexed (e.g., the variable name)
  index: Expression; // The expression within the brackets
}

// Add the new MemberAccessExpr interface
export interface MemberAccessExpr extends BaseNode {
  kind: 'MemberAccessExpr';
  object: Expression; // The expression whose member is accessed (e.g., variable or result of another expr)
  property: string;   // The name of the property being accessed
}

// Represents a list literal expression like [1, "a", x + 1]
export interface ListLiteralExpr extends BaseNode {
  kind: 'ListLiteralExpr';
  elements: Expression[]; // Elements are expressions to be evaluated
}

// Represents an object literal expression like { key1: "value", key2: y, "quoted key": 1 }
export interface ObjectLiteralExpr extends BaseNode {
  kind: 'ObjectLiteralExpr';
  properties: Record<string, Expression>; // Property values are expressions
  // Note: Keys are strings. Parser will handle identifier vs string keys if needed.
}

// Represents CALC { formula: "...", vars: {...} } - REMOVED
/*
export interface CalcExpr extends BaseNode {
  kind: 'CalcExpr';
  formula: string;
  variables: Record<string, Expression>; // Map internal var name to its expression
}
*/

// --- Statements ---

export type Statement =
  | LetStatement
  | CallStatement
  | IfStatement
  | ForStatement
  | ExpressionStatement;
  // | PrintStatement; // Remove PrintStatement from Statement type

export interface LetStatement extends BaseNode {
  kind: 'LetStatement';
  variableName: string;
  value: Expression;
}

export interface CallStatement extends BaseNode {
  kind: 'CallStatement';
  toolName: string;
  arguments: Record<string, Expression>;
}

export interface IfStatement extends BaseNode {
  kind: 'IfStatement';
  condition: Expression;
  thenBlock: Statement[]; // Body is a list of statements
  elseBlock?: Statement[]; // Optional else block
}

export interface ForStatement extends BaseNode {
  kind: 'ForStatement';
  iteratorVariable: string;
  iterable: Expression; // Expression evaluating to the list
  loopBlock: Statement[]; // Body is a list of statements
}

// Add the ExpressionStatement interface
export interface ExpressionStatement extends BaseNode {
    kind: 'ExpressionStatement';
    expression: Expression;
}

// --- Top Level ---

export interface Script extends BaseNode {
  kind: 'Script';
  statements: Statement[];
}

// --- Helper Functions (Type Guards) ---
// These help in the interpreter to narrow down the type

export function isLiteralExpr(node: BaseNode): node is LiteralExpr {
    return (node as any)?.kind === 'LiteralExpr';
}

export function isVariableExpr(node: BaseNode): node is VariableExpr {
    return (node as any)?.kind === 'VariableExpr';
}

export function isBinaryOpExpr(node: BaseNode): node is BinaryOpExpr {
    return (node as any)?.kind === 'BinaryOpExpr';
}

// Add the type guard for ArrayIndexExpression
export function isArrayIndexExpression(node: BaseNode): node is ArrayIndexExpression {
    return (node as any)?.kind === 'ArrayIndexExpression';
}

// Add the type guard for MemberAccessExpr
export function isMemberAccessExpression(node: BaseNode): node is MemberAccessExpr {
    return (node as any)?.kind === 'MemberAccessExpr';
}

export function isLetStatement(node: BaseNode): node is LetStatement {
     return (node as any)?.kind === 'LetStatement';
}

export function isCallStatement(node: BaseNode): node is CallStatement {
     return (node as any)?.kind === 'CallStatement';
}

export function isIfStatement(node: BaseNode): node is IfStatement {
     return (node as any)?.kind === 'IfStatement';
}

export function isForStatement(node: BaseNode): node is ForStatement {
     return (node as any)?.kind === 'ForStatement';
}

// Add type guard for ListLiteralExpr
export function isListLiteralExpr(node: BaseNode): node is ListLiteralExpr {
    return (node as any)?.kind === 'ListLiteralExpr';
}

// Add type guard for ObjectLiteralExpr
export function isObjectLiteralExpr(node: BaseNode): node is ObjectLiteralExpr {
    return (node as any)?.kind === 'ObjectLiteralExpr';
}
