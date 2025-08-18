export enum TokenType {
    // Keywords (Uppercase)
    LET = 'LET',
    CALL = 'CALL',
    IF = 'IF',
    THEN = 'THEN',
    ELSE = 'ELSE',
    END = 'END',
    FOR = 'FOR',
    IN = 'IN',
    DO = 'DO',
    PRINT = 'PRINT',
    NOW = 'NOW',
    // Logical Operators (Uppercase)
    AND = 'AND',
    OR = 'OR',
    NOT = 'NOT',
    // Boolean Literals (Uppercase)
    TRUE = 'TRUE',
    FALSE = 'FALSE',
    // Null Literal (Uppercase)
    NULL = 'NULL',

    // Identifier (Case-sensitive)
    IDENTIFIER = 'IDENTIFIER',

    // Literals
    NUMBER = 'NUMBER',
    STRING = 'STRING',

    // Operators & Punctuation
    ASSIGN = '=',
    EQ = '==',
    NE = '!=',
    GT = '>',
    LT = '<',
    GE = '>=',
    LE = '<=',
    DOT = '.',
    LBRACE = '{',
    RBRACE = '}',
    LPAREN = '(',
    RPAREN = ')',
    COLON = ':',
    COMMA = ',',
    // List delimiters
    LBRACKET = '[',
    RBRACKET = ']',
    // Arithmetic
    PLUS = '+',
    MINUS = '-',
    STAR = '*',
    SLASH = '/',

    // Modulo
    PERCENT = '%',

    // Control
    COMMENT = 'COMMENT', // Usually ignored, but tokenized first
    WHITESPACE = 'WHITESPACE', // Usually ignored
    EOF = 'EOF', // End of File
    UNKNOWN = 'UNKNOWN' // Error token
}

// Represents a single token identified by the lexer
export interface Token {
    type: TokenType;
    value: string; // The actual text matched
    line: number;
    column: number;
}

// Maps specific *lowercase* strings (for JSON compatibility) 
// and *uppercase* strings (for keywords) to their token types
const KEYWORDS: Record<string, TokenType> = {
    // Keywords (Uppercase)
    LET: TokenType.LET,
    CALL: TokenType.CALL,
    IF: TokenType.IF,
    THEN: TokenType.THEN,
    ELSE: TokenType.ELSE,
    END: TokenType.END,
    FOR: TokenType.FOR,
    IN: TokenType.IN,
    DO: TokenType.DO,
    // PRINT, NOW, FORMAT are handled like IDENTIFIERs for function calls
    AND: TokenType.AND,
    OR: TokenType.OR,
    NOT: TokenType.NOT,
    // Literals (Lowercase for JSON compatibility)
    true: TokenType.TRUE,     // Map lowercase 'true' to TRUE TokenType
    false: TokenType.FALSE,   // Map lowercase 'false' to FALSE TokenType
    null: TokenType.NULL,     // Map lowercase 'null' to NULL TokenType
};

// Order matters! Longer operators first (e.g., >= before >)
const tokenPatterns: Array<[TokenType, RegExp]> = [
    // Match comments first and consume the potential newline
    [TokenType.COMMENT, /^\/\/[^\n]*(\n|\r\n)?/],
    [TokenType.WHITESPACE, /^[ \t\r\n]+/], // Match whitespace (including newlines)

    // Operators (Longer first)
    [TokenType.EQ, /^==/],
    [TokenType.NE, /^!=/],
    [TokenType.GE, /^>=/],
    [TokenType.LE, /^<=/],
    [TokenType.GT, /^>/],
    [TokenType.LT, /^</],
    [TokenType.ASSIGN, /^=/],

    // Punctuation
    [TokenType.LBRACE, /^{/],
    [TokenType.RBRACE, /^}/],
    [TokenType.LPAREN, /^\(/],
    [TokenType.RPAREN, /^\)/],
    [TokenType.COLON, /^:/],
    [TokenType.COMMA, /^,/],
    [TokenType.DOT, /^\./],
    // List delimiters
    [TokenType.LBRACKET, /^\[/],
    [TokenType.RBRACKET, /^\]/],

    // Arithmetic Operators (must come after multi-char operators like ==)
    [TokenType.PLUS, /^\+/],
    [TokenType.MINUS, /^-/],
    [TokenType.STAR, /^\*/],
    [TokenType.SLASH, /^\//],
    [TokenType.PERCENT, /^%/],

    // Literals
    [TokenType.NUMBER, /^\d+(\.\d+)?/], // Integer or float
    [TokenType.STRING, /^"([^\\"]|\\.)*"/], // Double-quoted string with escapes

    // Keywords / Identifiers / Booleans (Check Keywords map after matching)
    // Must come after operators to avoid matching parts of them (e.g., '==' vs '=')
    [TokenType.IDENTIFIER, /^[a-zA-Z_][a-zA-Z_0-9]*/],
];

/**
 * Tokenizes a NuwaScript string into an array of Tokens.
 * @param input The NuwaScript code as a string.
 * @returns An array of Tokens.
 * @throws Error if unknown characters are encountered.
 */
export function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let line = 1;
    let column = 1;
    let remainingInput = input;

    while (remainingInput.length > 0) {
        let matchFound = false;

        for (const [type, regex] of tokenPatterns) {
            const match = remainingInput.match(regex);

            if (match) {
                const value = match[0];
                matchFound = true;

                // Ignore whitespace and comments, but update line/column for whitespace
                if (type === TokenType.WHITESPACE) {
                    const lines = value.split('\n');
                    if (lines.length > 1) {
                        line += lines.length - 1;
                        // Calculate column based on the last line's length
                        const lastLine = lines[lines.length - 1];
                        column = lastLine !== undefined ? lastLine.length + 1 : 1;
                    } else {
                        column += value.length;
                    }
                } else if (type === TokenType.COMMENT) {
                     // If comment spans to newline, update line count, reset column.
                     // Simple approach: Assume comment consumes rest of line,
                     // newline handled by next WHITESPACE token. Reset column.
                    // A more precise lexer might integrate newline handling here.
                    // For now, just ignore and let newline handle line count.
                     column = 1; // Reset column conceptually after comment
                } else {
                    let finalType: TokenType = type;
                    let finalValue = value;

                    // Handle identifiers that might be keywords or literals
                    if (type === TokenType.IDENTIFIER) {
                        // Check the KEYWORDS map using the *exact* matched value
                        const keywordType = KEYWORDS[value]; 
                        if (keywordType) {
                            finalType = keywordType;
                            // Value for TRUE/FALSE/NULL tokens should ideally be the keyword itself?
                            // Or should parser handle conversion? Let's keep value as matched string for now.
                        } else {
                            // It's a regular identifier, keep type as IDENTIFIER
                            // and value as the case-sensitive matched string.
                        }
                    }
                    // The parser will handle converting token values like "true"/"false"/"null" 
                    // into actual boolean/null values for LiteralExpr.
                    
                    // Handle string literal value (remove quotes, process escapes)
                    else if (type === TokenType.STRING) {
                        finalValue = JSON.parse(value); // Use JSON.parse for robustness
                    }
                     // Handle number literal value
                    else if (type === TokenType.NUMBER) {
                       // value remains string, parser will convert
                    }


                    tokens.push({ type: finalType, value: finalValue, line, column });
                    // Update column based on token length
                    column += value.length;
                }

                // Consume the matched part from the input
                remainingInput = remainingInput.slice(value.length);
                break; // Go to next iteration of the while loop
            }
        }

        if (!matchFound) {
            // If no pattern matched, it's an unknown character/sequence
            const unknownChar = remainingInput[0];
            // Check if unknownChar is actually undefined (empty remainingInput)
            if (unknownChar !== undefined) {
                 // THROW an error instead of just logging
                 throw new Error(`LexerError: Unknown character '${unknownChar}' at line ${line}, column ${column}`);
                /* // Old code:
                tokens.push({ type: TokenType.UNKNOWN, value: unknownChar, line, column });
                console.error(`LexerError: Unknown character '${unknownChar}' at ${line}:${column}`);
                remainingInput = remainingInput.slice(1); // Skip the unknown char
                 column += 1;
                */
            } else if (remainingInput.length > 0) {
                 // Should not happen if regexes cover basics, but as fallback
                 throw new Error(`LexerError: Unrecognized sequence at line ${line}, column ${column}`);
                /* // Old code:
                console.error(`LexerError: Unrecognized sequence at ${line}:${column}`);
                remainingInput = remainingInput.slice(1);
                 column += 1;
                */
            } else {
                 // End of input was reached unexpectedly? Should be handled by EOF.
                 // If this happens, it indicates a logic error in the loop or patterns.
                 break; // Exit loop if truly nothing left
            }
        }
    }

    tokens.push({ type: TokenType.EOF, value: '', line, column });
    return tokens;
}
