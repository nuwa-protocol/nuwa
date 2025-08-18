import { JSONSchema7, JSONSchema7Definition } from 'json-schema';
// Import the necessary types AND the helper function from tools.ts
import { z } from 'zod'; // Needed for the helper function
import zodToJsonSchema from 'zod-to-json-schema'; // Needed for the helper function
// Import the necessary types from tools.ts
import { ToolRegistry, ToolSchema, NormalizedToolSchema, SchemaInput, normalizeSchemaToJsonSchema } from './tools.js'; // Use NormalizedToolSchema for getAllSchemas result

// Define schemas using JSON Schema format directly, which is a valid SchemaInput
const BUILTIN_FUNCTION_SCHEMAS: ToolSchema[] = [
  {
    name: 'PRINT',
    description: 'Outputs the string representation of an expression to the console (default adds newline). Always returns null.',
    parameters: { // Use JSON Schema object for parameters
      type: 'object',
      properties: {
        expression: { // Parameter name is the key
          description: 'The value to print.',
          // JSON Schema doesn't have a direct 'any' type equivalent like Zod,
          // but omitting 'type' often implies any type, or use {}
          // Let's omit 'type' to imply any JsonValue is acceptable.
        }
      },
      required: ['expression'], // List required parameter names
      additionalProperties: false, // Be strict
    },
    returns: {
      description: "Always returns null",
      schema: { type: 'null' } // JSON Schema for the return type
    }
  },
  {
    name: 'NOW',
    description: 'Returns the current Unix timestamp (number of milliseconds since epoch).',
    parameters: { // No parameters
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    returns: {
      description: "Unix timestamp in milliseconds",
      schema: { type: 'number', format: 'int64' } // Use number type
    }
  },
  {
    name: 'FORMAT',
    description: 'Formats a string using named placeholders ({key}) from a values object. Returns the formatted string.',
    parameters: {
      type: 'object',
      properties: {
        template_string: {
          type: 'string',
          description: 'The template string with {key} placeholders.'
        },
        values_object: {
          type: 'object',
          description: 'An object containing key-value pairs for substitution.',
          // Allow any properties within the values object
          additionalProperties: true // Or define expected properties if known
        }
      },
      required: ['template_string', 'values_object'],
      additionalProperties: false,
    },
    returns: {
      description: "The formatted string",
      schema: { type: 'string' }
    }
  }
];

// Keep the template definition here
export const GENERATION_PROMPT_TEMPLATE = `# NuwaScript Syntax Rules:
- Keywords MUST be UPPERCASE: LET, CALL, IF, THEN, ELSE, END, FOR, IN, DO, AND, OR, NOT. (PRINT, NOW, FORMAT are built-in functions, not keywords)
- Built-in function names MUST be UPPERCASE: PRINT, NOW, FORMAT.
- Boolean literals MUST be lowercase: true, false.
- Null literal MUST be lowercase: null.
- Identifiers (variable names, tool names) are CASE-SENSITIVE and can be lower/mixed case.
- String literals use DOUBLE QUOTES: "hello".
- List literals use square brackets: [1, "a", TRUE, [nested_list]]. Elements are comma-separated.
- Object literals use curly braces: { key1: "value", "key-2": 123, key3: [1, 2] }. Keys can be identifiers or strings (double-quoted). Values can be any expression. Pairs are comma-separated.
- Comments start with //
- Basic arithmetic and comparison operators are supported: +, -, *, /, %, ==, !=, >, <, >=, <=.
- The '+' operator is ONLY for number addition, NOT string concatenation.
- Logical operators: AND, OR, NOT. Operator precedence follows standard rules.
- Member access uses dot notation: object.property.
- Array element access uses bracket notation: list[index]. Index MUST be an integer.

# Core Statements:
LET varName = <expression> // Assign any expression (literal, variable, result of CALL/CALC/function)
LET resultVar = CALL tool_name { arg1: <value>, ... } // Assign tool result to variable
CALL tool_name { arg1: <expression>, ... } // Call tool as a standalone statement
// **IMPORTANT: Tool arguments MUST use curly braces {}, NOT parentheses (). Example: CALL my_tool { name: "test" }**
IF <condition_expression> THEN
  <statements>
ELSE // Optional
  <statements>
END
FOR itemVar IN <list_expression> DO
  <statements>
END
// PRINT(<expression>) // Was previously here, now defined below

# Built-in Function Signatures:
Use these built-in functions according to their definitions:
--- START BUILT-IN FUNCTION SCHEMAS ---
{builtin_functions_schema}
--- END BUILT-IN FUNCTION SCHEMAS ---

# Available Tools:
You have access to the following tools. Only use these registered tools with the exact names provided:
--- START TOOL SCHEMAS ---
{tools_schema}
--- END TOOL SCHEMAS ---

# Current System State:
This represents the current state of the system. You can use this information to inform your response:
--- START STATE ---
{state_info}
--- END STATE ---

{app_specific_guidance}

# Instructions:

- Generate *only* the NuwaScript code required to complete the user task using the defined syntax and available tools.
- Output *only* raw code. Do not include explanations, markdown formatting, or code blocks (like \`\`\`).
- Ensure all keywords (LET, CALL, IF, etc.) are UPPERCASE. Built-in function names (PRINT, NOW, FORMAT) MUST also be UPPERCASE. Literals true, false, null MUST be lowercase. **Pay close attention to the CALL syntax using {}.**
- **Strictly use only the tools listed under "# Available Tools:" and functions under "# Built-in Function Signatures:". Do not invent or call unlisted items.**
- **CRITICAL: The '+' operator is ONLY for number addition. DO NOT use '+' for string concatenation.**
- **To create complex strings with variables, ALWAYS use the FORMAT(template_string, {key: value, ...}) function as defined above.**
- **Use PRINT(<expression>) for output. See its signature above. PRINT is for side-effects (displaying output) and returns null; do not assign its result unless you specifically need null.**
  - **Example (Correct FORMAT usage):** To print "Placing item at x=100, y=200", generate: \`PRINT(FORMAT("Placing item at x={valX}, y={valY}", {valX: itemX, valY: itemY}))\`
  - **Example (Correct simple PRINT):** To print "Task complete.", generate: \`PRINT("Task complete.")\`
  - **Example (Incorrect FORMAT usage):** DO NOT generate \`PRINT(FORMAT("Task complete.", {}))\`.
  - **Example (Incorrect FORMAT for static parts):** If all parts are static strings, combine them directly. DO NOT generate \`PRINT(FORMAT("Result: {val}", {val: "Success"}))\`. INSTEAD, generate: \`PRINT("Result: Success")\`.
  - **Example (Incorrect string concatenation):** DO NOT generate \`PRINT("Coordinates: " + xCoord)\`. Use FORMAT instead.
- **IMPORTANT: When assigning the result of a tool call to a variable, the \`CALL\` keyword is mandatory. Use the format: \`LET variable = CALL tool_name { ... }\`. Never omit the \`CALL\` keyword in this context.**
- **SECURITY & USABILITY: Handling Example Requests:**
  - The NuwaScript code you generate is **executed immediately** by the system.
  - If the user asks for an **"example"** of NuwaScript code (e.g., "Show me how to use IF", "Give me an example of a FOR loop"), DO NOT generate the example code directly for execution.
  - Instead, you MUST generate a \`PRINT\` command where the argument is a **single string containing the entire example script**. Use \`\\n\` for newlines and escape quotes \`\\\"\` within the string as needed for correct formatting.
  - **Example (User asks for IF example):**
      - **Incorrect (Executes code):** \`IF true THEN PRINT("Condition met") END\`
      - **Correct (Prints the example script as text):** \`PRINT("// Example of an IF statement\\nLET temperature = 25\\nIF temperature > 30 THEN\\n  PRINT(\\\"It's hot!\\\")\\nELSE\\n  PRINT(\\\"It's not too hot.\\\")\\nEND")\` // Note double backslashes for \n and triple for \"

- Consider the "# Current System State:" information when generating the code.
`;

/**
 * Formats tool or function schemas (using NormalizedToolSchema) into a string suitable for the prompt.
 * @param schemas An array of NormalizedToolSchema objects.
 * @param isBuiltin Flag to indicate if these are built-in functions for slightly different formatting if needed.
 * @returns A formatted string representation of the schemas.
 */
function formatSchemasForPrompt(schemas: NormalizedToolSchema[], isBuiltin: boolean = false): string {
    if (!schemas || schemas.length === 0) {
        return isBuiltin ? "No built-in functions defined." : "No tools available.";
    }

    return schemas.map(s => {
        const paramsSchema = s.parameters;
        const properties = paramsSchema.properties || {};
        const requiredParams = new Set(paramsSchema.required || []);
        let paramsString: string;
        const paramEntries = Object.entries(properties);
        if (paramEntries.length === 0) {
            paramsString = "";
        } else {
            paramsString = paramEntries.map(([name, propSchemaDef]) => {
                let type = 'any';
                let description = '';
                 if (typeof propSchemaDef === 'object' && propSchemaDef !== null) {
                    type = propSchemaDef.type ? String(propSchemaDef.type) : 'any';
                    description = propSchemaDef.description ? ` (${propSchemaDef.description})` : '';
                    if (type === 'array' && typeof propSchemaDef.items === 'object' && propSchemaDef.items !== null) {
                        const itemSchema = propSchemaDef.items as JSONSchema7;
                        type = `${itemSchema.type ? String(itemSchema.type) : 'any'}[]`;
                    } else if (Array.isArray(propSchemaDef.type)) {
                         type = propSchemaDef.type.join(' | ');
                    }
                } else if (typeof propSchemaDef === 'boolean') {
                     type = propSchemaDef ? 'any' : 'never';
                 }
                const isRequired = requiredParams.has(name);
                return `${name}: ${type}${isRequired ? '' : '?'}${description}`;
            }).join(', ');
        }

        // Format return type (s.returns.schema can be boolean or object)
        const returnsSchema = s.returns.schema; // Type: JSONSchema7Definition
        let returnsString: string = 'any'; // Default

        if (typeof returnsSchema === 'object' && returnsSchema !== null) {
            // It's an object schema
            if (returnsSchema.type === 'array') {
                // --- FIX TYPE GUARD for items --- 
                 if (typeof returnsSchema.items === 'object' && returnsSchema.items !== null && !(Array.isArray(returnsSchema.items))) {
                     // Single schema for items - Safely access type
                     const itemSchema = returnsSchema.items as JSONSchema7;
                     returnsString = `${itemSchema.type ? String(itemSchema.type) : 'any'}[]`;
                 } else {
                     // items might be boolean, array of schemas, or missing - simplify
                     returnsString = 'any[]';
                 }
            } else if (Array.isArray(returnsSchema.type)) {
                returnsString = returnsSchema.type.join(' | ');
            } else if (returnsSchema.type) {
                returnsString = String(returnsSchema.type);
            } else if (Object.keys(returnsSchema).length > 0) {
                 returnsString = 'object';
            }
        } else if (typeof returnsSchema === 'boolean') {
            returnsString = returnsSchema ? 'any' : 'never';
        }

        const returnDescription = s.returns.description ? ` (${s.returns.description})` : '';
        const prefix = isBuiltin ? '' : '- ';
        const mainDescription = s.description ? `${s.description}` : '';
        return `${prefix}${s.name}({${paramsString}}): ${mainDescription} -> ${returnsString}${returnDescription}`;
    }).join('\n');
}

/**
 * Builds the complete prompt string for the LLM.
 * @param registry The ToolRegistry containing available tools.
 * @param options Optional parameters including application-specific guidance and state inclusion.
 * @returns The formatted prompt string.
 */
export function buildPrompt(
    registry: ToolRegistry, 
    options: {
        includeState?: boolean;
        appSpecificGuidance?: string;
    } = {}
): string {
    const { includeState = true, appSpecificGuidance = "" } = options;

    const toolSchemas = registry.getAllSchemas();

    // Normalize BUILTIN_FUNCTION_SCHEMAS
    const normalizedBuiltinSchemasResult = BUILTIN_FUNCTION_SCHEMAS.map(schemaDef => {
        try {
            // --- FIX: Add missing 4th argument (expectObject) --- 
             const normalizedParams = normalizeSchemaToJsonSchema(schemaDef.parameters, 'parameters', schemaDef.name, true);
             const normalizedReturns = normalizeSchemaToJsonSchema(schemaDef.returns.schema, 'returns.schema', schemaDef.name, false);

            // Construct the object matching NormalizedToolSchema structure
            const normalized: NormalizedToolSchema = {
                name: schemaDef.name,
                description: schemaDef.description,
                parameters: normalizedParams as NormalizedToolSchema['parameters'], // Cast is safe
                returns: {
                    description: schemaDef.returns.description, // Keep as potentially undefined initially
                    schema: normalizedReturns
                }
            };
            return normalized;
        } catch (e) {
            console.error(`Error normalizing built-in schema '${schemaDef.name}':`, e);
            return null; // Return null on error
        }
    });
    
    // --- FIX: Filter nulls and assert type --- 
    const normalizedBuiltinSchemas = normalizedBuiltinSchemasResult.filter(
        (s): s is NormalizedToolSchema => s !== null
    );

    // Format the schemas
    const toolSchemasString = formatSchemasForPrompt(toolSchemas, false);
    const builtinFuncSchemasString = formatSchemasForPrompt(normalizedBuiltinSchemas, true);

    const stateInfo = includeState ? registry.formatStateForPrompt() : "No state information available.";

    const prompt = GENERATION_PROMPT_TEMPLATE
        .replace('{tools_schema}', toolSchemasString)
        .replace('{state_info}', stateInfo)
        .replace('{app_specific_guidance}', appSpecificGuidance)
        .replace('{builtin_functions_schema}', builtinFuncSchemasString);

    return prompt;
}