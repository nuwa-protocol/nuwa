import { describe, test, expect, beforeEach } from '@jest/globals';
import { Scope, Interpreter, OutputHandler } from '../src/interpreter';
import { ToolRegistry } from '../src/tools';
import { JsonValue } from '../src/values';
import * as Errors from '../src/errors';
import { setupTestContext, runScript, MockCallLog } from './test_utils'; // Import helpers

describe('Interpreter - Basic Operations', () => {
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
        // Define the context wrapper for this describe block
        runScriptInContext = (scriptText, initialScope) => runScript(scriptText, toolRegistry, mockOutputHandler, initialScope); // Keep arrow on same line
    });

    test('should handle LET statement with literals', async () => {
        const script = `
            LET count = 100
            LET name = "Nuwa"
            LET flag = true
            LET pi = 3.14
            LET n = null
        `;
        const finalScope = await runScriptInContext(script);
        expect(finalScope.get('count')).toBe(100);
        expect(finalScope.get('name')).toBe('Nuwa');
        expect(finalScope.get('flag')).toBe(true);
        expect(finalScope.get('pi')).toBe(3.14);
        expect(finalScope.get('n')).toBe(null);
    });

    test('should handle LET statement with variable assignment', async () => {
        const script = `
            LET x = 50
            LET y = x
        `;
        const finalScope = await runScriptInContext(script);
        expect(finalScope.get('x')).toBe(50);
        expect(finalScope.get('y')).toBe(50);
    });

    test('should handle undefined variable error', async () => {
        const script = `LET y = x`; // x is not defined
        await expect(runScriptInContext(script)).rejects.toThrow(Errors.UndefinedVariableError);
        await expect(runScriptInContext(script)).rejects.toThrow(/Variable 'x' not defined/);
    });
}); 