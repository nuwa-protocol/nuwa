import * as AST from './ast.js';
import { ToolRegistry, RegisteredTool, EvaluatedToolArguments, ToolContext, NormalizedToolSchema } from './tools.js';
import {
    JsonValue, isJsonObject, jsonValuesAreEqual, isBoolean, isJsonArray,
    isNumber, isString, jsonValueToString, isNull
} from './values.js';
import {
    InterpreterError, RuntimeError, TypeError, UndefinedVariableError,
    MemberAccessError, ToolNotFoundError, ToolArgumentError, ToolExecutionError,
    UnsupportedOperationError, DivisionByZeroError, InvalidConditionError,
    InvalidIterableError,
    IndexOutOfBoundsError
} from './errors.js';
import { isArrayIndexExpression, isMemberAccessExpression, isListLiteralExpr, isObjectLiteralExpr } from './ast.js';
import { parse } from './parser.js';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { JSONSchema7, JSONSchema7Definition } from 'json-schema';

// --- Scope Class Definition ---
export class Scope {
    private values: Map<string, JsonValue>;
    private parent?: Scope; // Reference to the parent scope

    constructor(parent?: Scope) {
        this.values = new Map();
        this.parent = parent;
    }

    // Define or update a variable in the CURRENT scope
    set(name: string, value: JsonValue): void {
        this.values.set(name, value);
    }

    // Look up a variable, checking current scope then parent(s) recursively
    get(name: string): JsonValue | undefined {
        if (this.values.has(name)) {
            const val = this.values.get(name);
            return val;
        }
        if (this.parent) {
            return this.parent.get(name); // Delegate lookup to parent
        }
        return undefined;
    }

    // Check if a variable exists in this scope or any parent scope
    has(name: string): boolean {
        if (this.values.has(name)) {
            return true;
        }
        if (this.parent) {
            return this.parent.has(name); // Delegate check to parent
        }
        return false;
    }

    // Deletes a variable ONLY from the current scope.
    // Returns true if the variable existed and was deleted, false otherwise.
    delete(name: string): boolean {
        return this.values.delete(name);
    }
}

// Type for built-in function implementations
// They receive evaluated arguments and the original AST node for error reporting
// They can return a value directly or a promise (for potential future async built-ins)
// Note: Currently NOW and FORMAT are sync.
type BuiltinFunctionImplementation = (
    args: JsonValue[],
    callExpr: AST.FunctionCallExpr
) => JsonValue | Promise<JsonValue>;

// Type for the variable scope
// REMOVED: export type Scope = Map<string, JsonValue>;
// Type for the output handler (e.g., for PRINT)
export type OutputHandler = (output: string) => void;

export class Interpreter {
    private toolRegistry: ToolRegistry;
    private readonly outputHandler: OutputHandler;
    // Registry for built-in functions
    private readonly builtinFunctions: Map<string, BuiltinFunctionImplementation>;

    constructor(toolRegistry?: ToolRegistry, outputHandler?: OutputHandler) {
        this.toolRegistry = toolRegistry ?? new ToolRegistry();
        // Default output handler simply logs to console
        this.outputHandler = outputHandler ?? ((output) => console.log(output));

        // Initialize and register built-in functions
        this.builtinFunctions = new Map();

        // Register NOW
        this.builtinFunctions.set('NOW', (args, callExpr) => {
            if (args.length !== 0) {
                throw new RuntimeError(`Function NOW() expects no arguments, got ${args.length}`, callExpr);
            }
            return Date.now(); // Return milliseconds directly
        });

        // Register FORMAT
        // Note: We keep evaluateFormatFunction as a private method for clarity
        this.builtinFunctions.set('FORMAT', (args, callExpr) => {
             return this.evaluateFormatFunction(args, callExpr);
        });

        // Register PRINT
        this.builtinFunctions.set('PRINT', (args, callExpr) => {
            if (args.length !== 1) {
                throw new RuntimeError(`Function PRINT() expects exactly 1 argument, got ${args.length}`, callExpr);
            }
            const valueToPrint = args[0];
            // Use jsonValueToString (which now handles undefined safely)
            this.outputHandler(jsonValueToString(valueToPrint));
            return null; // PRINT function returns null
        });

        // Add future built-ins here, e.g.:
        // this.builtinFunctions.set('LENGTH', this.evaluateLengthFunction);
    }

    /**
     * Parses and executes a NuwaScript string directly.
     * @param scriptText The NuwaScript code string.
     * @param initialScopeData Optional initial variable scope data.
     * @returns A Promise resolving to the final variable scope.
     * @throws LexerError or ParserError if parsing fails.
     * @throws InterpreterError or subclasses if execution fails.
     */
    async executeScript(scriptText: string, initialScopeData?: Record<string, JsonValue>): Promise<Scope> {
        // 1. Parse the script text into an AST
        const ast = parse(scriptText);

        // 2. Call the existing execute method with the parsed AST
        return this.execute(ast, initialScopeData);
    }

    /**
     * Executes a complete NuwaScript AST.
     * @param script The Script AST node.
     * @param initialScopeData Optional initial variable scope data.
     * @returns A Promise resolving to the final variable scope.
     */
    async execute(script: AST.Script, initialScopeData?: Record<string, JsonValue>): Promise<Scope> {
        if (script.kind !== 'Script') {
            throw new InterpreterError("Invalid AST root: expected 'Script'");
        }
        // Create the top-level scope for this execution using the new class
        const scope = new Scope();
        // Populate the initial scope if provided
        if (initialScopeData) {
            for (const [key, value] of Object.entries(initialScopeData)) {
                scope.set(key, value);
            }
        }
        await this.executeStatements(script.statements, scope);
        return scope;
    }

    /**
     * Gets the tool registry used by this interpreter.
     * @returns The tool registry.
     */
    getToolRegistry(): ToolRegistry {
        return this.toolRegistry;
    }

    /**
     * Sets a state value in the tool registry.
     * @param key - The state key.
     * @param value - The state value.
     */
    setState(key: string, value: JsonValue): void {
        this.toolRegistry.setState(key, value);
    }

    /**
     * Gets a state value from the tool registry.
     * @param key - The state key.
     * @returns The state value or undefined if not found.
     */
    getStateValue(key: string): JsonValue | undefined {
        return this.toolRegistry.getStateValue(key);
    }

    /**
     * Checks if a state value exists in the tool registry.
     * @param key - The state key.
     * @returns True if the state value exists, false otherwise.
     */
    hasState(key: string): boolean {
        return this.toolRegistry.hasState(key);
    }

    /**
     * Gets all state values from the tool registry.
     * @returns The state store.
     */
    getAllState(): Map<string, JsonValue> {
        return this.toolRegistry.getState();
    }

    /**
     * Clears all state values in the tool registry.
     */
    clearState(): void {
        this.toolRegistry.clearState();
    }

    // --- Statement Execution ---

    private async executeStatements(statements: AST.Statement[], scope: Scope): Promise<void> {
        for (const statement of statements) {
            // TODO: Add check for return/break/continue signals if those are added later
            await this.executeStatement(statement, scope);
        }
    }

    private async executeStatement(statement: AST.Statement, scope: Scope): Promise<void> {
        switch (statement.kind) {
            case 'LetStatement':
                await this.executeLetStatement(statement, scope);
                break;
            case 'CallStatement':
                await this.executeCallStatement(statement, scope);
                break;
            case 'IfStatement':
                await this.executeIfStatement(statement, scope);
                break;
            case 'ForStatement':
                await this.executeForStatement(statement, scope);
                break;
            // Add case for ExpressionStatement
            case 'ExpressionStatement':
                 // Evaluate the expression for its side effects (e.g., PRINT)
                 // Discard the result (e.g., null from PRINT)
                await this.evaluateExpression(statement.expression, scope);
                break;
            default:
                // This ensures exhaustiveness checking if new statement kinds are added
                const exhaustiveCheck: never = statement;
                throw new RuntimeError(`Unsupported statement kind: ${(exhaustiveCheck as any)?.kind}`, statement);
        }
    }

    private async executeLetStatement(stmt: AST.LetStatement, scope: Scope): Promise<void> {
        const value = await this.evaluateExpression(stmt.value, scope);
        scope.set(stmt.variableName, value);
    }

    private async executeCallStatement(stmt: AST.CallStatement, scope: Scope): Promise<void> {
        // Evaluate arguments and execute the tool, ignoring the return value
        await this.executeToolCall(stmt.toolName, stmt.arguments, scope);
    }

    private async executeIfStatement(stmt: AST.IfStatement, scope: Scope): Promise<void> {
        const conditionValue = await this.evaluateExpression(stmt.condition, scope);
        if (!isBoolean(conditionValue)) {
            throw new InvalidConditionError(`IF condition evaluated to type ${typeof conditionValue}, expected boolean.`, stmt.condition);
        }

        if (conditionValue) {
            await this.executeStatements(stmt.thenBlock, scope);
        } else if (stmt.elseBlock) {
            await this.executeStatements(stmt.elseBlock, scope);
        }
    }

    private async executeForStatement(stmt: AST.ForStatement, scope: Scope): Promise<void> {
        const iterableValue = await this.evaluateExpression(stmt.iterable, scope);
        if (!isJsonArray(iterableValue)) {
            throw new InvalidIterableError(`FOR loop expected an iterable list, got ${typeof iterableValue}.`, stmt.iterable);
        }

        // Loop through the items
        for (const item of iterableValue) {
            // Create a NEW child scope for EACH iteration. Pass the parent scope.
            const loopScope = new Scope(scope); // scope is the parent scope here

            // Set the iterator variable ONLY in the new loop scope
            loopScope.set(stmt.iteratorVariable, item);

            // Execute the loop block using the NEW loop scope
            await this.executeStatements(stmt.loopBlock, loopScope);
            // TODO: Add BREAK/CONTINUE handling here (would need to break out of this inner loop)

            // No need for 'finally' block or restoring old_value, as loopScope is discarded automatically.
        }
    }

    // --- Expression Evaluation ---

    private async evaluateExpression(expression: AST.Expression, scope: Scope): Promise<JsonValue> {
        switch (expression.kind) {
            case 'LiteralExpr':
                return expression.value;
            case 'VariableExpr':
                return this.evaluateVariableExpr(expression, scope);
            case 'BinaryOpExpr':
                return await this.evaluateBinaryOpExpr(expression, scope);
            case 'UnaryOpExpr':
                return await this.evaluateUnaryOpExpr(expression, scope);
            case 'FunctionCallExpr':
                return this.evaluateFunctionCallExpr(expression, scope);
             case 'ToolCallExpr':
                return await this.evaluateToolCallExpr(expression, scope);

            // Add case for ArrayIndexExpression
            case 'ArrayIndexExpression':
                return await this.evaluateArrayIndexExpression(expression, scope);

            // Add case for MemberAccessExpression
            case 'MemberAccessExpr':
                return await this.evaluateMemberAccessExpression(expression, scope);

            // Add case for ListLiteralExpr
            case 'ListLiteralExpr':
                return await this.evaluateListLiteralExpr(expression, scope);

            // Add case for ObjectLiteralExpr
            case 'ObjectLiteralExpr':
                return await this.evaluateObjectLiteralExpr(expression, scope);

            default:
                 // Update exhaustiveness check (though TS switch should handle it)
                if (isListLiteralExpr(expression)) {
                    return await this.evaluateListLiteralExpr(expression, scope);
                }
                if (isObjectLiteralExpr(expression)) {
                    return await this.evaluateObjectLiteralExpr(expression, scope);
                }
                if (isArrayIndexExpression(expression)) {
                    return await this.evaluateArrayIndexExpression(expression, scope);
                }
                if (isMemberAccessExpression(expression)) {
                    return await this.evaluateMemberAccessExpression(expression, scope);
                }
                const exhaustiveCheck: never = expression;
                throw new RuntimeError(`Unsupported expression kind: ${(exhaustiveCheck as any)?.kind}`, expression);
        }
    }

    private evaluateVariableExpr(expr: AST.VariableExpr, scope: Scope): JsonValue {
        const name = expr.name;
        // --- IMPORTANT ---
        // The logic for dotted names (e.g., obj.prop.sub) is now handled by
        // the combination of VariableExpr (for the base 'obj') and successive
        // MemberAccessExpr evaluations triggered by the parser recognizing '.'
        // So, VariableExpr evaluation *only* needs to handle simple lookups.
        // Remove the old dotted name logic from here.
        const value = scope.get(name);
        if (value === undefined) {
            throw new UndefinedVariableError(name, expr);
        }
        return value;
    }

    private async evaluateBinaryOpExpr(expr: AST.BinaryOpExpr, scope: Scope): Promise<JsonValue> {
        const left = await this.evaluateExpression(expr.left, scope);
        const right = await this.evaluateExpression(expr.right, scope);
        const op = expr.operator;

        switch (op) {
            // Equality (using deep equality check)
            case '==': return jsonValuesAreEqual(left, right);
            case '!=': return !jsonValuesAreEqual(left, right);

            // Comparisons (expect numbers)
            case '>':
            case '<':
            case '>=':
            case '<=':
                if (!isNumber(left) || !isNumber(right)) {
                    throw new TypeError(`Comparison operator '${op}' requires number operands, got ${typeof left} and ${typeof right}.`, {leftValue: left, rightValue: right, operator: op, node: expr});
                }
                if (op === '>') return left > right;
                if (op === '<') return left < right;
                if (op === '>=') return left >= right;
                if (op === '<=') return left <= right;
                break; // Should not be reached

            // Logical (expect booleans)
            case 'AND':
                if (!isBoolean(left) || !isBoolean(right)) {
                    throw new TypeError(`Logical operator 'AND' requires boolean operands, got ${typeof left} and ${typeof right}.`, {leftValue: left, rightValue: right, operator: op, node: expr});
                }
                return left && right;
            case 'OR':
                 if (!isBoolean(left) || !isBoolean(right)) {
                    throw new TypeError(`Logical operator 'OR' requires boolean operands, got ${typeof left} and ${typeof right}.`, {leftValue: left, rightValue: right, operator: op, node: expr});
                }
                return left || right;

            // Arithmetic (expect numbers)
            case '+':
            case '-':
            case '*':
            case '/':
            case '%': // Add case for modulo
                 if (!isNumber(left) || !isNumber(right)) {
                    throw new TypeError(`Arithmetic operator '${op}' requires number operands, got ${typeof left} and ${typeof right}.`, { leftValue: left, rightValue: right, operator: op, node: expr });
                }
                if (op === '+') return left + right;
                if (op === '-') return left - right;
                if (op === '*') return left * right;
                if (op === '/') {
                    if (right === 0) {
                        throw new DivisionByZeroError(expr);
                    }
                    return left / right;
                }
                if (op === '%') { // Add modulo logic
                    if (right === 0) {
                        throw new DivisionByZeroError(expr); // Cannot perform modulo by zero
                    }
                    return left % right;
                }
                break; // Should not be reached
        }
        throw new UnsupportedOperationError(`Binary operator '${op}' is not supported.`, expr);
    }

     private async evaluateUnaryOpExpr(expr: AST.UnaryOpExpr, scope: Scope): Promise<JsonValue> {
        const operand = await this.evaluateExpression(expr.operand, scope);
        const op = expr.operator;

        switch (op) {
            case 'NOT':
                if (!isBoolean(operand)) {
                     throw new TypeError(`Logical operator 'NOT' requires a boolean operand, got ${typeof operand}.`, {leftValue: operand, operator: op, node: expr});
                }
                return !operand;
            case '-': // Handle unary minus
                 if (!isNumber(operand)) {
                    throw new TypeError(`Unary operator '-' requires a number operand, got ${typeof operand}.`, {leftValue: operand, operator: op, node: expr});
                }
                return -operand;
            case '+': // Handle unary plus
                if (!isNumber(operand)) {
                    throw new TypeError(`Unary operator '+' requires a number operand, got ${typeof operand}.`, {leftValue: operand, operator: op, node: expr});
                }
                return +operand; // Or just operand, as unary plus usually doesn't change number value
        }
        // The UnaryOperator type should prevent reaching here if all cases are handled
        throw new UnsupportedOperationError(`Unary operator '${op}' is not supported.`, expr);
    }

    private async evaluateFunctionCallExpr(expr: AST.FunctionCallExpr, scope: Scope): Promise<JsonValue> {
        const functionName = expr.functionName;

        // Evaluate arguments first
        const evaluatedArgs: JsonValue[] = [];
        for (const arg of expr.arguments) {
            evaluatedArgs.push(await this.evaluateExpression(arg, scope));
        }

        // Look up the function in the registry
        const funcImpl = this.builtinFunctions.get(functionName);

        if (funcImpl) {
            // Call the registered implementation
            // Use await in case the implementation is async in the future
            return await funcImpl(evaluatedArgs, expr);
        } else {
            // Future: Could check for user-defined functions in scope here
            throw new RuntimeError(`Unknown function called: ${functionName}`, expr);
        }
    }

    // Helper function for FORMAT logic
    private evaluateFormatFunction(args: JsonValue[], callExpr: AST.FunctionCallExpr): string {
        if (args.length !== 2) {
            throw new RuntimeError(`FORMAT function expects 2 arguments (template string, values object), got ${args.length}`, callExpr);
        }

        const templateArg = args[0];
        const valuesArg = args[1];

        if (!isString(templateArg)) {
            throw new TypeError(`FORMAT function's first argument must be a string, got ${typeof templateArg}`, { node: callExpr.arguments[0] });
        }

        // Explicitly check if valuesArg is undefined to satisfy the type checker before calling isJsonObject
        if (valuesArg === undefined) {
             // This case should logically be unreachable due to the args.length check above
            throw new RuntimeError(`FORMAT function received undefined second argument (internal error).`, callExpr);
        }

        // Now valuesArg is narrowed down to JsonValue, so the call is safe
        if (!isJsonObject(valuesArg)) {
            throw new TypeError(`FORMAT function's second argument must be an object, got ${typeof valuesArg}`, { node: callExpr.arguments[1] });
        }

        const templateString = templateArg;
        const valuesObject = valuesArg; // Already checked as { [key: string]: JsonValue }

        // Regex to find {key}, {{, or }}
        // Define regex only once
        const regex = /\{([a-zA-Z_][a-zA-Z_0-9]*)\}|\{\{|\}\}/g;
        let result = '';
        let lastIndex = 0;
        let match; // Declare match here

        while ((match = regex.exec(templateString)) !== null) {
            // Append text before the match
            result += templateString.substring(lastIndex, match.index);

            if (match[0] === '{{') { // Escaped '{'
                result += '{';
            } else if (match[0] === '}}') { // Escaped '}'
                result += '}';
            } else if (match[1]) { // Named placeholder {key}
                const key = match[1];
                // Use Object.prototype.hasOwnProperty for safety
                if (Object.prototype.hasOwnProperty.call(valuesObject, key)) {
                    const valueToFormat = valuesObject[key];
                    // Remove the explicit undefined check as hasOwnProperty confirms presence
                    // Use non-null assertion (!) to satisfy TypeScript since JsonValue doesn't include undefined
                    // Ensure jsonValueToString is imported from './values.js'
                    result += jsonValueToString(valueToFormat!); // Use existing helper from values.ts
                } else {
                    // Provide context in error message
                    throw new RuntimeError(`Key '${key}' not found in FORMAT arguments object`, callExpr.arguments[1]);
                }
            }
            lastIndex = regex.lastIndex;
        }

        // Append remaining text after the last match
        result += templateString.substring(lastIndex);

        return result; // Return the final string directly
    }

    private async evaluateToolCallExpr(expr: AST.ToolCallExpr, scope: Scope): Promise<JsonValue> {
        return this.executeToolCall(expr.toolName, expr.arguments, scope);
    }

    // NEW METHOD: Evaluates a MemberAccessExpression (e.g., expr.property)
    private async evaluateMemberAccessExpression(expr: AST.MemberAccessExpr, scope: Scope): Promise<JsonValue> {
        // 1. Evaluate the object part of the expression
        const objectValue = await this.evaluateExpression(expr.object, scope);
        const propertyName = expr.property;

        // 2. Check if the result is actually an object
        if (!isJsonObject(objectValue)) {
            // Provide context in the error message
             const objectExprString = expr.object.kind; // Basic representation
            throw new MemberAccessError(`Cannot access property '${propertyName}' on non-object value resulting from '${objectExprString}' (type: ${typeof objectValue}).`, expr);
        }

        // 3. Check if the property exists
        if (!(propertyName in objectValue)) {
             const objectExprString = expr.object.kind;
             // Consider allowing access to non-existent properties, returning null?
             // Let's be strict for now and require existence.
            throw new MemberAccessError(`Property '${propertyName}' does not exist on object resulting from '${objectExprString}'.`, expr);
             // Alternatively, return null:
             // return null;
        }

        // 4. Access the property
        const propertyValue = objectValue[propertyName];

        // 5. Handle potential undefined values from access (convert to null)
        return propertyValue === undefined ? null : propertyValue;
    }

    // NEW METHOD: Evaluates an ArrayIndexExpression
    private async evaluateArrayIndexExpression(expr: AST.ArrayIndexExpression, scope: Scope): Promise<JsonValue> {
        const objectValue = await this.evaluateExpression(expr.object, scope);
        const indexValue = await this.evaluateExpression(expr.index, scope);

        // Type checking
        if (!isJsonArray(objectValue)) {
            throw new TypeError(`Cannot access index on non-list value (type: ${typeof objectValue}).`, { node: expr.object });
        }
        if (!isNumber(indexValue) || !Number.isInteger(indexValue)) {
            throw new TypeError(`List index must be an integer, got ${typeof indexValue} (${indexValue}).`, { node: expr.index });
        }

        // Bounds checking
        const index = indexValue as number; // Safe cast after checks
        const array = objectValue as JsonValue[]; // Safe cast after checks
        if (index < 0 || index >= array.length) {
            throw new IndexOutOfBoundsError(index, array.length, expr);
        }

        // Perform access, converting undefined to null
        const result = array[index];
        return result === undefined ? null : result;
    }

    // NEW METHOD: Evaluates a ListLiteralExpr
    private async evaluateListLiteralExpr(expr: AST.ListLiteralExpr, scope: Scope): Promise<JsonValue[]> {
      const evaluatedElements: JsonValue[] = [];
      for (const elementExpr of expr.elements) {
        const evaluatedValue = await this.evaluateExpression(elementExpr, scope);
        evaluatedElements.push(evaluatedValue);
      }
      return evaluatedElements;
    }

    // NEW METHOD: Evaluates an ObjectLiteralExpr
    private async evaluateObjectLiteralExpr(expr: AST.ObjectLiteralExpr, scope: Scope): Promise<{ [key: string]: JsonValue }> {
      const evaluatedProperties: { [key: string]: JsonValue } = {};
      for (const key in expr.properties) {
        // Ensure hasOwnProperty check for safety, although TS AST structure makes it less critical
        if (Object.prototype.hasOwnProperty.call(expr.properties, key)) {
          const valueExpr = expr.properties[key];
          if (valueExpr) { // Check if valueExpr is not undefined
             const evaluatedValue = await this.evaluateExpression(valueExpr, scope);
             evaluatedProperties[key] = evaluatedValue;
          } else {
              // Handle case where property value might be missing in AST (shouldn't happen with parser)
              evaluatedProperties[key] = null; // Or throw error
          }
        }
      }
      return evaluatedProperties;
    }

    // --- Tool Execution Helper ---

    /**
     * Executes a tool call using the *normalized* JSON schema for validation.
     * @param toolName The name of the tool to call.
     * @param argsExpr The arguments to pass to the tool as expressions.
     * @param scope The current variable scope.
     * @returns The result of the tool execution.
     * @throws ToolNotFoundError, ToolArgumentError, ToolExecutionError.
     */
    private async executeToolCall(
        toolName: string,
        argsExpr: Record<string, AST.Expression>, // Arguments from the script AST
        scope: Scope
    ): Promise<JsonValue> {
        // Lookup the tool
        const tool = this.toolRegistry.lookup(toolName);
        if (!tool) {
            throw new ToolNotFoundError(`Tool '${toolName}' not found.`, { toolName });
        }

        // Destructure the internal execute function (adapter)
        const { execute } = tool; 
        // Schema is still available via tool.schema if needed elsewhere, but not for pre-validation
        
        const evaluatedArgs: EvaluatedToolArguments = {};

        // Evaluate each argument expression provided in the script
        for (const [argName, argExpr] of Object.entries(argsExpr)) {
            evaluatedArgs[argName] = await this.evaluateExpression(argExpr, scope);
        }

        // REMOVE Argument Validation using JSON Schema (now handled by Zod in internalExecute)
        /*
        const paramsSchema = normalizedSchema.parameters;
        if (typeof paramsSchema !== 'object' || paramsSchema === null || Array.isArray(paramsSchema)) {
            throw new Error(`Internal error: Normalized parameters schema for tool '${toolName}' is not an object.`);
        }
        // 1. Check for missing required parameters
        const requiredParams = paramsSchema.required || [];
        for (const requiredParamName of requiredParams) {
            if (!(requiredParamName in evaluatedArgs)) {
                throw new ToolArgumentError(
                    `Missing required parameter '${requiredParamName}' for tool '${toolName}'.`,
                    { toolName, parameter: requiredParamName }
                );
            }
        }
        // 2. Check for extraneous parameters
        if (paramsSchema.additionalProperties === undefined || paramsSchema.additionalProperties === false) {
            const definedParams = paramsSchema.properties ? Object.keys(paramsSchema.properties) : [];
            for (const providedArgName in evaluatedArgs) {
                if (!definedParams.includes(providedArgName)) {
                     throw new ToolArgumentError(
                        `Unexpected parameter '${providedArgName}' provided for tool '${toolName}'. Allowed parameters are: ${definedParams.join(', ') || 'none'}.`,
                        { toolName, parameter: providedArgName }
                    );
                }
            }
        }
        */

        try {
            // Call the internal execute function (adapter)
            // This function now handles Zod validation internally
            const result = await execute(evaluatedArgs);

            // Return value validation (optional) could still happen here using tool.schema.returns.schema
            // or be left to the internalExecute function as currently implemented.

            return result === undefined ? null : result;

        } catch (error) {
            // Handle errors thrown from the internalExecute (adapter) function.
            // This includes Zod validation errors (ToolArgumentError) and user function errors.
            if (error instanceof ToolArgumentError) {
                // Re-throw ToolArgumentError directly
                throw error;
            } else if (error instanceof Error) {
                // Wrap other errors (likely from userExecute or unexpected issues) in ToolExecutionError
                throw new ToolExecutionError(
                    `Error executing tool '${toolName}': ${error.message}`,
                    { toolName, error }
                );
            } else {
                // Handle non-Error throws (less common)
                throw new ToolExecutionError(
                    `Unknown error executing tool '${toolName}'.`,
                    { toolName }
                );
            }
        }
    }
}
