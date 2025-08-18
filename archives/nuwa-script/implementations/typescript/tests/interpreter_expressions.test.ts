import { describe, test, expect, beforeEach } from '@jest/globals';
import { Scope, Interpreter, OutputHandler } from '../src/interpreter';
import { ToolRegistry } from '../src/tools';
import { JsonValue } from '../src/values';
import * as Errors from '../src/errors';
import { setupTestContext, runScript, MockCallLog } from './test_utils'; // Import helpers

describe('Interpreter - Expressions & Operators', () => {
    let toolRegistry: ToolRegistry;
    let capturedOutput: string[];
    let mockOutputHandler: OutputHandler;
    let callLog: MockCallLog[];
    let runScriptInContext: (scriptText: string, initialScope?: Record<string, JsonValue>) => Promise<Scope>; // Context wrapper

    beforeEach(() => {
        const context = setupTestContext();
        toolRegistry = context.toolRegistry;
        capturedOutput = context.capturedOutput;
        mockOutputHandler = context.mockOutputHandler;
        callLog = context.callLog;
        // Define the context wrapper
        runScriptInContext = (scriptText, initialScope) =>
            runScript(scriptText, toolRegistry, mockOutputHandler, initialScope);
    });

    test('should evaluate binary comparison and logical operators', async () => {
        const script = `
            LET gt = 10 > 5       // true
            LET lt = 3 < 8       // true
            LET ge = 5 >= 5       // true
            LET le = 4 <= 3       // false
            LET eqNum = 5 == 5    // true
            LET neNum = 5 != 6    // true
            LET eqStr = "a" == "a"  // true
            LET neStr = "a" != "b"  // true
            LET eqBool = true == true // true
            LET neBool = true != false // true
            LET eqNull = null == null // true
            LET neMixed = 10 == "10" // false (strict type equality)
            LET andOp = true AND false // false
            LET orOp = true OR false  // true
        `;
        const finalScope = await runScriptInContext(script);
        expect(finalScope.get('gt')).toBe(true);
        expect(finalScope.get('lt')).toBe(true);
        expect(finalScope.get('ge')).toBe(true);
        expect(finalScope.get('le')).toBe(false);
        expect(finalScope.get('eqNum')).toBe(true);
        expect(finalScope.get('neNum')).toBe(true);
        expect(finalScope.get('eqStr')).toBe(true);
        expect(finalScope.get('neStr')).toBe(true);
        expect(finalScope.get('eqBool')).toBe(true);
        expect(finalScope.get('neBool')).toBe(true);
        expect(finalScope.get('eqNull')).toBe(true);
        expect(finalScope.get('neMixed')).toBe(false);
        expect(finalScope.get('andOp')).toBe(false);
        expect(finalScope.get('orOp')).toBe(true);
    });

    test('should evaluate basic arithmetic operations', async () => {
        let scope = await runScriptInContext('LET r = 10 + 5');
        expect(scope.get('r')).toBe(15);
        scope = await runScriptInContext('LET r = 10 - 5');
        expect(scope.get('r')).toBe(5);
        scope = await runScriptInContext('LET r = 10 * 5');
        expect(scope.get('r')).toBe(50);
        scope = await runScriptInContext('LET r = 10 / 2');
        expect(scope.get('r')).toBe(5);
        scope = await runScriptInContext('LET r = -5 + 8');
        expect(scope.get('r')).toBe(3);
    });

    test('should evaluate operator precedence correctly', async () => {
        let scope = await runScriptInContext('LET r = 10 + 6 / 2'); // 10 + 3 = 13
        expect(scope.get('r')).toBe(13);
        scope = await runScriptInContext('LET r = 10 - 4 * 2'); // 10 - 8 = 2
        expect(scope.get('r')).toBe(2);
        scope = await runScriptInContext('LET r = 10 * 2 + 6 / 3'); // 20 + 2 = 22
        expect(scope.get('r')).toBe(22);
        scope = await runScriptInContext('LET r = 10 % 3 + 1'); // 1 + 1 = 2
        expect(scope.get('r')).toBe(2);
    });

    test('should evaluate parentheses overriding precedence', async () => {
        let scope = await runScriptInContext('LET r = (10 + 5) * 2'); // 15 * 2 = 30
        expect(scope.get('r')).toBe(30);
        scope = await runScriptInContext('LET r = 10 / (2 + 3)'); // 10 / 5 = 2
        expect(scope.get('r')).toBe(2);
    });

    test('should evaluate associativity (left-to-right)', async () => {
        let scope = await runScriptInContext('LET r = 10 - 5 + 2'); // (10 - 5) + 2 = 7
        expect(scope.get('r')).toBe(7);
        scope = await runScriptInContext('LET r = 10 * 6 / 3'); // (10 * 6) / 3 = 20
        expect(scope.get('r')).toBe(20);
        scope = await runScriptInContext('LET r = 10 / 2 * 5'); // (10 / 2) * 5 = 25
        expect(scope.get('r')).toBe(25);
        scope = await runScriptInContext('LET r = 10 % 3 * 2'); // (10 % 3) * 2 = 2
        expect(scope.get('r')).toBe(2);
    });

    test('should evaluate unary NOT operator', async () => {
        const script = `
            LET flagT = true
            LET flagF = false
            LET notT = NOT flagT
            LET notF = NOT flagF
        `;
        const finalScope = await runScriptInContext(script);
        expect(finalScope.get('notT')).toBe(false);
        expect(finalScope.get('notF')).toBe(true);
    });

    test('should evaluate unary PLUS and MINUS operators', async () => {
        let scope = await runScriptInContext('LET r = -5');
        expect(scope.get('r')).toBe(-5);
        scope = await runScriptInContext('LET r = +10');
        expect(scope.get('r')).toBe(10);
        scope = await runScriptInContext('LET x = 5 LET r = -x');
        expect(scope.get('r')).toBe(-5);
        scope = await runScriptInContext('LET r = 10 + -5'); // Binary + with Unary -
        expect(scope.get('r')).toBe(5);
        scope = await runScriptInContext('LET r = -(-5)'); // Double unary minus
        expect(scope.get('r')).toBe(5);
    });

    test('should handle division by zero error', async () => {
        await expect(runScriptInContext('LET x = 10 / 0')).rejects.toThrow(Errors.DivisionByZeroError);
    });

    // --- Modulo Operator Tests ---
    describe('Modulo Operator (%)', () => {
        // Helper function specific to these tests, calling outer runScript
        async function runScriptAndCheckResult(script: string, varName: string, expectedValue: JsonValue) {
            const finalScope = await runScriptInContext(script); // Use the context wrapper
            expect(finalScope.get(varName)).toBe(expectedValue);
        }

        test('should perform basic modulo operations', async () => {
            await runScriptAndCheckResult('LET r = 10 % 3', 'r', 1);
            await runScriptAndCheckResult('LET r = 10 % 2', 'r', 0);
            await runScriptAndCheckResult('LET r = 5 % 8', 'r', 5);
            await runScriptAndCheckResult('LET r = 123 % 45', 'r', 33);
        });

        test('should handle negative operands correctly', async () => {
            await runScriptAndCheckResult('LET r = -10 % 3', 'r', -1);
            await runScriptAndCheckResult('LET r = 10 % -3', 'r', 1);
            await runScriptAndCheckResult('LET r = -10 % -3', 'r', -1);
        });

        test('should handle floating point numbers (like JS %)', async () => {
             await runScriptAndCheckResult('LET r = 5.5 % 2', 'r', 1.5);
             await runScriptAndCheckResult('LET r = 10 % 3.5', 'r', 3);
        });

        test('should throw DivisionByZeroError for modulo by zero', async () => {
            await expect(runScriptInContext('LET r = 10 % 0')).rejects.toThrow(Errors.DivisionByZeroError);
        });

        test('should throw TypeError for non-number operands', async () => {
            await expect(runScriptInContext('LET r = "10" % 3')).rejects.toThrow(Errors.TypeError);
            await expect(runScriptInContext('LET r = 10 % "3"')).rejects.toThrow(Errors.TypeError);
            await expect(runScriptInContext('LET r = true % 2')).rejects.toThrow(Errors.TypeError);
            await expect(runScriptInContext('LET r = 10 % null')).rejects.toThrow(Errors.TypeError);
        });

        // Precedence tests are covered above, no need to repeat specific % precedence here
    });

    // --- Type Error Tests for Operations ---
    test('should handle type errors for comparison operators', async () => {
        await expect(runScriptInContext('LET x = 10 > "hello"')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = true < 1')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = null >= 0')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = [1] <= [1]')).rejects.toThrow(Errors.TypeError);
    });

    test('should handle type errors for logical operators', async () => {
        await expect(runScriptInContext('LET x = "true" AND false')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = 1 OR true')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = NOT 123')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = NOT "hello"')).rejects.toThrow(Errors.TypeError);
    });

    test('should handle type errors for arithmetic and unary +/- operators', async () => {
        // Arithmetic
        await expect(runScriptInContext('LET x = 10 + "5"')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = "10" + 5')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = true - 1')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = 5 * null')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = [1] / 2')).rejects.toThrow(Errors.TypeError);
        // Unary +/-
        await expect(runScriptInContext('LET x = -"5"')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = +true')).rejects.toThrow(Errors.TypeError);
        await expect(runScriptInContext('LET x = -[1]')).rejects.toThrow(Errors.TypeError);
    });
}); 