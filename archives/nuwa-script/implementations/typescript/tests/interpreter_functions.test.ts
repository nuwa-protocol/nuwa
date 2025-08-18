import { describe, test, expect, beforeEach } from '@jest/globals';
import { Scope, Interpreter, OutputHandler } from '../src/interpreter';
import { ToolRegistry } from '../src/tools';
import { JsonValue } from '../src/values';
import { ParserError } from '../src/parser';
import * as Errors from '../src/errors';
import { setupTestContext, runScript, MockCallLog } from './test_utils'; // Import helpers

describe('Interpreter - Built-in Functions', () => {
    let toolRegistry: ToolRegistry;
    let capturedOutput: string[];
    let mockOutputHandler: OutputHandler;
    let callLog: MockCallLog[]; // Although functions don't use tools, keep for context setup consistency
    let runScriptInContext: (scriptText: string, initialScope?: Record<string, JsonValue>) => Promise<Scope>;

    beforeEach(() => {
        const context = setupTestContext();
        toolRegistry = context.toolRegistry;
        capturedOutput = context.capturedOutput;
        mockOutputHandler = context.mockOutputHandler;
        callLog = context.callLog;
        runScriptInContext = (scriptText, initialScope) =>
            runScript(scriptText, toolRegistry, mockOutputHandler, initialScope);
    });

    // --- NOW Function --- 
    test('should evaluate NOW() function', async () => {
        const script = 'LET time = NOW()';
        const start = Date.now();
        const finalScope = await runScriptInContext(script);
        const end = Date.now();
        const timeVal = finalScope.get('time');
        expect(typeof timeVal).toBe('number');
        expect(timeVal).toBeGreaterThanOrEqual(start);
        expect(timeVal).toBeLessThanOrEqual(end + 1); // Allow for slight delay
    });

    test('should throw error if NOW() is called with arguments', async () => {
        const script = 'LET time = NOW(123)'; // Invalid call
        await expect(runScriptInContext(script)).rejects.toThrow(ParserError);
        await expect(runScriptInContext(script)).rejects.toThrow(/Function NOW\(\) expects no arguments/);
    });

    // --- PRINT Function --- 
    test('PRINT function should call output handler', async () => {
        const script = `
            LET msg = "Hello"
            PRINT(msg)
            PRINT(123)
            PRINT(true)
            PRINT(null)
            PRINT([1, "a"])
            PRINT({b: 2})
        `;
        await runScriptInContext(script);
        expect(capturedOutput).toEqual(['Hello', '123', 'true', 'null', '[1, a]', '{b: 2}']);
    });

    test('PRINT function should return null', async () => {
        const script = `LET result = PRINT("test")`;
        const finalScope = await runScriptInContext(script);
        expect(finalScope.get('result')).toBeNull();
        expect(capturedOutput).toEqual(['test']); // Ensure output still happened
    });

    test('should handle PRINT function argument count errors', async () => {
        await expect(runScriptInContext(`PRINT()`)).rejects.toThrow(Errors.RuntimeError);
        await expect(runScriptInContext(`PRINT()`)).rejects.toThrow(/expects exactly 1 argument, got 0/);
        await expect(runScriptInContext(`PRINT(1, 2)`)).rejects.toThrow(Errors.RuntimeError);
        await expect(runScriptInContext(`PRINT(1, 2)`)).rejects.toThrow(/expects exactly 1 argument, got 2/);
    });

    // --- FORMAT Function --- 
    describe('FORMAT Function', () => {
        test('should format string with basic key replacement', async () => {
            const script = `LET result = FORMAT("Hello, {name}!", {name: "Nuwa"})`;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toBe('Hello, Nuwa!');
        });

        test('should format string with multiple keys', async () => {
            const script = `LET result = FORMAT("{greeting}, {audience}!", {greeting: "Hi", audience: "World"})`;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toBe('Hi, World!');
        });

        test('should format different value types', async () => {
            const script = `
                LET data = {
                    str: "text",
                    num: 123.45,
                    boolT: true,
                    boolF: false,
                    nil: null,
                    list: [1, "two", true],
                    obj: { nested: "ok" }
                }
                LET result = FORMAT("S:{str} N:{num} BT:{boolT} BF:{boolF} NL:{nil} L:{list} O:{obj}", data)
            `;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toBe('S:text N:123.45 BT:true BF:false NL:null L:[1, two, true] O:{nested: ok}');
        });

        test('should handle escaped curly braces', async () => {
            const script = `LET result = FORMAT("Show literal braces {{ and }} with value {val}", {val: 10})`;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toBe('Show literal braces { and } with value 10');
        });

        test('should handle adjacent placeholders and braces', async () => {
            const script = `LET result = FORMAT("{a}{b}, {{literal}} {c}", {a: 1, b: 2, c: 3})`;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toBe('12, {literal} 3');
        });

        test('should throw RuntimeError for missing key', async () => {
            const script = `LET result = FORMAT("Hello, {name}!", { NOME: "Nuwa" })`;
            await expect(runScriptInContext(script)).rejects.toThrow(Errors.RuntimeError);
            await expect(runScriptInContext(script)).rejects.toThrow(/Key 'name' not found in FORMAT arguments object/);
        });

        test('should throw RuntimeError for wrong number of arguments (0)', async () => {
            const script = `LET result = FORMAT()`;
            await expect(runScriptInContext(script)).rejects.toThrow(Errors.RuntimeError);
            await expect(runScriptInContext(script)).rejects.toThrow(/FORMAT function expects 2 arguments/);
        });

        test('should throw RuntimeError for wrong number of arguments (1)', async () => {
            const script = `LET result = FORMAT("template")`;
            await expect(runScriptInContext(script)).rejects.toThrow(Errors.RuntimeError);
            await expect(runScriptInContext(script)).rejects.toThrow(/FORMAT function expects 2 arguments/);
        });

        test('should throw RuntimeError for wrong number of arguments (3)', async () => {
            const script = `LET result = FORMAT("template", {}, {})`;
            await expect(runScriptInContext(script)).rejects.toThrow(Errors.RuntimeError);
            await expect(runScriptInContext(script)).rejects.toThrow(/FORMAT function expects 2 arguments/);
        });

        test('should throw TypeError if first argument is not a string', async () => {
            const script = `LET result = FORMAT(123, {})`;
            await expect(runScriptInContext(script)).rejects.toThrow(Errors.TypeError);
            await expect(runScriptInContext(script)).rejects.toThrow(/first argument must be a string/);
        });

        test('should throw TypeError if second argument is not an object', async () => {
            const script = `LET result = FORMAT("template", [1, 2])`;
            await expect(runScriptInContext(script)).rejects.toThrow(Errors.TypeError);
            await expect(runScriptInContext(script)).rejects.toThrow(/second argument must be an object/);
        });

        test('should handle empty template string', async () => {
            const script = `LET result = FORMAT("", {a: 1})`;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toBe('');
        });

        test('should handle template with no placeholders', async () => {
            const script = `LET result = FORMAT("Just text.", {a: 1})`;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toBe('Just text.');
        });

        test('should handle empty values object', async () => {
            const script = `LET result = FORMAT("Static text", {})`;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toBe('Static text');
        });

        test('should throw error for missing key with empty values object', async () => {
            const script = `LET result = FORMAT("Needs {key}", {})`;
            await expect(runScriptInContext(script)).rejects.toThrow(Errors.RuntimeError);
            await expect(runScriptInContext(script)).rejects.toThrow(/Key 'key' not found/);
        });

        test('should handle valid identifier keys', async () => {
            const script = `LET result = FORMAT("{_key1} {key2_} {k3y_}", {_key1: "a", key2_: "b", k3y_: "c"})`;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toBe('a b c');
        });
    }); // End of FORMAT Function describe block
}); 