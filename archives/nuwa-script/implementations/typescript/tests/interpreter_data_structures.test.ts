import { describe, test, expect, beforeEach, it } from '@jest/globals';
import { Scope, Interpreter, OutputHandler } from '../src/interpreter';
import { z } from 'zod';
import {
    ToolRegistry,
    ToolSchema,
    EvaluatedToolArguments,
    SchemaInput
} from '../src/tools';
import { JsonValue } from '../src/values';
import * as Errors from '../src/errors';
import { setupTestContext, runScript, MockCallLog } from './test_utils'; // Import helpers

describe('Interpreter - Data Structures & Access', () => {
    let toolRegistry: ToolRegistry;
    let capturedOutput: string[];
    let mockOutputHandler: OutputHandler;
    let callLog: MockCallLog[];
    let runScriptInContext: (scriptText: string, initialScope?: Record<string, JsonValue>) => Promise<Scope>;

    // --- Tool Definition for this test suite ---
    // Define schemas and function for processData tool
    const processDataParams = z.object({ 
        data: z.any().describe('The data to process (any type)') 
    });
    const processDataReturn = z.any().describe('The processed data (passthrough)');

    let receivedDataByProcessData: any = null;
    const mockProcessData = async (args: z.infer<typeof processDataParams>): Promise<z.infer<typeof processDataReturn>> => {
        receivedDataByProcessData = args.data;
        return receivedDataByProcessData;
    };

    beforeEach(() => {
        const context = setupTestContext(); // Setup includes get_obj mock for member access tests
        toolRegistry = context.toolRegistry;
        capturedOutput = context.capturedOutput;
        mockOutputHandler = context.mockOutputHandler;
        callLog = context.callLog;
        
        // Clear received data before each test using it
        receivedDataByProcessData = null;
        
        // Register processData tool here
        try {
            toolRegistry.register({
                name: 'processData',
                description: 'Processes any data structure.',
                parameters: processDataParams,
                returns: { 
                    description: 'The processed data (passthrough)', 
                    schema: processDataReturn 
                },
                execute: async (args) => {
                    receivedDataByProcessData = args.data;
                    return receivedDataByProcessData;
                }
            });
        } catch(error) {
            // Fail test if registration fails unexpectedly
            console.error("Failed to register processData tool in test setup:", error);
            throw error; 
        }

        runScriptInContext = (scriptText, initialScope) =>
            runScript(scriptText, toolRegistry, mockOutputHandler, initialScope);
    });

    // --- List Literal Tests ---
    describe('List Literals', () => {
        test('should evaluate simple list literal', async () => {
            const script = `LET x = [1, "two", true, null, 3.14]`;
            const scope = await runScriptInContext(script);
            expect(scope.get('x')).toEqual([1, "two", true, null, 3.14]);
        });

        test('should evaluate empty list literal', async () => {
            const script = `LET x = []`;
            const scope = await runScriptInContext(script);
            expect(scope.get('x')).toEqual([]);
        });

        test('should evaluate list literal with expressions', async () => {
            const script = `
                LET a = 10
                LET b = "hello"
                LET x = [a, a * 2, b, 5 > 2]
            `;
            const scope = await runScriptInContext(script);
            expect(scope.get('x')).toEqual([10, 20, "hello", true]);
        });

        test('should evaluate nested list literals', async () => {
            const script = `LET x = [1, [2, 3], [4, [5]]]`;
            const scope = await runScriptInContext(script);
            expect(scope.get('x')).toEqual([1, [2, 3], [4, [5]]]);
        });
    });

    // --- Object Literal Tests ---
    describe('Object Literals', () => {
        test('should evaluate simple object literal', async () => {
            const script = `LET x = { name: "Nuwa", version: 1, active: true, config: null }`;
            const scope = await runScriptInContext(script);
            expect(scope.get('x')).toEqual({ name: "Nuwa", version: 1, active: true, config: null });
        });

        test('should evaluate object literal with string keys', async () => {
            const script = `LET x = { "first-name": "Nuwa", "dash-key": 123 }`;
            const scope = await runScriptInContext(script);
            expect(scope.get('x')).toEqual({ "first-name": "Nuwa", "dash-key": 123 });
        });

        test('should evaluate empty object literal', async () => {
            const script = `LET x = {}`;
            const scope = await runScriptInContext(script);
            expect(scope.get('x')).toEqual({});
        });

        test('should evaluate object literal with expressions', async () => {
            const script = `
                LET factor = 10
                LET label = "result"
                LET x = { value: factor * 5, status: label, valid: factor > 0 }
            `;
            const scope = await runScriptInContext(script);
            expect(scope.get('x')).toEqual({ value: 50, status: "result", valid: true });
        });

        test('should evaluate nested object literals', async () => {
            const script = `LET x = { data: { value: 99, units: "m" }, id: "abc" }`;
            const scope = await runScriptInContext(script);
            expect(scope.get('x')).toEqual({ data: { value: 99, units: "m" }, id: "abc" });
        });
    });

    // --- Combined Literal Tests ---
    describe('Combined Literals', () => {
        test('should evaluate nested list and object literals', async () => {
            const script = `
                LET id_1 = "001"
                LET items = [
                    { id: id_1, tags: ["a", "b", 1] },
                    { id: "002", data: { nested: true } }
                ]
                LET result = { success: true, payload: items }
            `;
            const scope = await runScriptInContext(script);
            expect(scope.get('result')).toEqual({
                success: true,
                payload: [
                    { id: "001", tags: ["a", "b", 1] },
                    { id: "002", data: { nested: true } }
                ]
            });
        });

        test('should allow list/object literals as tool arguments (using Zod)', async () => {
            // processData tool is now registered in beforeEach
            const script = `
                LET myData = { items: [1, { active: true }], name: "test" }
                CALL processData { data: myData }
                CALL processData { data: ["go", 2, false] }
                LET result = CALL processData { data: { x: 1 } }
            `;
            const scope = await runScriptInContext(script);

            // Check the data received by the mock function in the *last* call
            expect(receivedDataByProcessData).toEqual({ x: 1 }); 
            // Check the value returned by the *last* tool call expression
            expect(scope.get('result')).toEqual({ x: 1 }); 
        });
    });

    // --- Array Indexing Tests ---
    describe('Array Indexing []', () => {
        // Helper to run script with a predefined initial scope for these tests
        async function runArrayIndexScript(script: string): Promise<Scope> {
            const initialScopeData: Record<string, JsonValue> = {
                'myList': [10, "hello", true, null, 20],
                'nestedList': [1, [2, 3], 4],
                'listOfObjects': [{id: 1, val: 'a'}, {id: 2, val: 'b'}],
                'emptyList': [],
                'numVar': 1,
                'strVar': "not_a_list"
            };
            return runScriptInContext(script, initialScopeData);
        }

        test('should access element with literal index', async () => {
            const scope = await runArrayIndexScript(`LET x = myList[1]`);
            expect(scope.get('x')).toBe("hello");
        });

        test('should access element with variable index', async () => {
            const scope = await runArrayIndexScript(`
                LET index = 0
                LET x = myList[index]
            `);
            expect(scope.get('x')).toBe(10);
        });

        test('should access element with expression index', async () => {
            const scope = await runArrayIndexScript(`
                LET offset = 2
                LET x = myList[1 + offset] // index 3
            `);
            expect(scope.get('x')).toBe(null);
        });

        test('should access element from nested list', async () => {
            const scope = await runArrayIndexScript(`LET x = nestedList[1][0]`); // Access 2 from [2, 3]
            expect(scope.get('x')).toBe(2);
        });

        test('should access property after indexing list of objects', async () => {
            const scope = await runArrayIndexScript(`LET x = listOfObjects[0].val`);
            expect(scope.get('x')).toBe('a');
        });

        test('should access property via variable after indexing list of objects', async () => {
            const scope = await runArrayIndexScript(`
                LET idx = 1
                LET item = listOfObjects[idx]
                LET x = item.val
            `);
            expect(scope.get('x')).toBe('b');
        });

        // Error Cases
        test('should throw error for index out of bounds (positive)', async () => {
            await expect(runArrayIndexScript(`LET x = myList[5]`)).rejects.toThrow(Errors.IndexOutOfBoundsError);
            await expect(runArrayIndexScript(`LET x = myList[5]`)).rejects.toThrow('Index 5 is out of bounds');
        });

        test('should throw error for index out of bounds (negative)', async () => {
            await expect(runArrayIndexScript(`LET x = myList[-1]`)).rejects.toThrow(Errors.IndexOutOfBoundsError);
            await expect(runArrayIndexScript(`LET x = myList[-1]`)).rejects.toThrow('Index -1 is out of bounds');
        });

        test('should throw error for index out of bounds on empty list', async () => {
            await expect(runArrayIndexScript(`LET x = emptyList[0]`)).rejects.toThrow(Errors.IndexOutOfBoundsError);
            await expect(runArrayIndexScript(`LET x = emptyList[0]`)).rejects.toThrow('Index 0 is out of bounds');
        });

        test('should throw error for non-integer index (float)', async () => {
            await expect(runArrayIndexScript(`LET x = myList[1.5]`)).rejects.toThrow(Errors.TypeError);
            await expect(runArrayIndexScript(`LET x = myList[1.5]`)).rejects.toThrow('List index must be an integer');
        });

        test('should throw error for non-integer index (string)', async () => {
            await expect(runArrayIndexScript(`LET idx = "0" LET x = myList[idx]`)).rejects.toThrow(Errors.TypeError);
            await expect(runArrayIndexScript(`LET idx = "0" LET x = myList[idx]`)).rejects.toThrow('List index must be an integer');
        });

        test('should throw error for indexing non-list variable', async () => {
            await expect(runArrayIndexScript(`LET x = numVar[0]`)).rejects.toThrow(Errors.TypeError);
            await expect(runArrayIndexScript(`LET x = numVar[0]`)).rejects.toThrow('Cannot access index on non-list value');
        });

        test('should throw error for indexing undefined variable', async () => {
            // Need to run without initial scope for this one
            await expect(runScriptInContext(`LET x = undefinedList[0]`)).rejects.toThrow(Errors.UndefinedVariableError);
            await expect(runScriptInContext(`LET x = undefinedList[0]`)).rejects.toThrow("Variable 'undefinedList' not defined");
        });

        test('should throw error accessing property on non-object element after indexing', async () => {
            // myList[0] is number 10
            await expect(runArrayIndexScript(`LET x = myList[0].prop`)).rejects.toThrow(Errors.MemberAccessError);
            await expect(runArrayIndexScript(`LET x = myList[0].prop`)).rejects.toThrow("Cannot access property 'prop' on non-object value");
        });
    });

    // --- Member Access Tests ---
    describe('Member Access .', () => {
        test('should access object properties', async () => {
            const script = `
                LET obj = CALL get_obj {} // Returns { nested: { value: 99 } }
                LET val = obj.nested.value
            `;
            const finalScope = await runScriptInContext(script);
            expect(finalScope.get('val')).toBe(99);
            expect(callLog).toEqual(expect.arrayContaining([expect.objectContaining({ toolName: 'get_obj' })]));
        });

        test('should access properties of object literal', async () => {
             const script = `LET x = { key: "value", num: 123 }.key`;
             const scope = await runScriptInContext(script);
             expect(scope.get('x')).toBe("value");
        });

        test('should throw error for member access on non-object', async () => {
            const script = `
                LET x = 100
                LET y = x.property
            `;
            await expect(runScriptInContext(script)).rejects.toThrow(Errors.MemberAccessError);
            await expect(runScriptInContext(script)).rejects.toThrow(/Cannot access property 'property' on non-object value/);
        });

        test('should throw error for non-existent property', async () => {
            const script = `
                LET obj = CALL get_obj {}
                LET val = obj.non_existent
            `;
            await expect(runScriptInContext(script)).rejects.toThrow(Errors.MemberAccessError);
            await expect(runScriptInContext(script)).rejects.toThrow(/Property 'non_existent' does not exist/);
        });

        test('should throw error accessing property on undefined variable', async () => {
             await expect(runScriptInContext(`LET x = undefinedObj.prop`)).rejects.toThrow(Errors.UndefinedVariableError);
             await expect(runScriptInContext(`LET x = undefinedObj.prop`)).rejects.toThrow("Variable 'undefinedObj' not defined");
        });
    });
}); 