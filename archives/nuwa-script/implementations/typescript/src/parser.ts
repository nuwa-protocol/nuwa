import { Token, TokenType, tokenize } from './lexer.js';
import * as AST from './ast.js';
import { JsonValue } from './values.js'; // For literal parsing

export class ParserError extends Error {
    constructor(message: string, public token?: Token) {
        const position = token ? ` at ${token.line}:${token.column}` : '';
        super(`${message}${position}`);
        this.name = 'ParserError';
        Object.setPrototypeOf(this, ParserError.prototype);
    }
}

export class Parser {
    private tokens: Token[] = [];
    private current: number = 0; // Index of the next token to consume

    constructor(tokens: Token[]) {
        // Filter out whitespace and comments before parsing
        this.tokens = tokens.filter(token =>
            token.type !== TokenType.WHITESPACE && token.type !== TokenType.COMMENT
        );
        this.current = 0;
    }

    /**
     * Parses the token stream into a Script AST node.
     */
    public parse(): AST.Script {
        const statements: AST.Statement[] = [];
        while (!this.isAtEnd()) {
            statements.push(this.parseStatement());
        }
        return { kind: 'Script', statements };
    }

    // --- Statement Parsing ---

    private parseStatement(): AST.Statement {
        switch (this.peek().type) {
            case TokenType.LET:
                return this.parseLetStatement();
            case TokenType.CALL:
                // Check if it's CALL used as statement or expression context (not really possible at statement level)
                return this.parseCallStatement();
            case TokenType.IF:
                return this.parseIfStatement();
            case TokenType.FOR:
                return this.parseForStatement();
            default:
                // If it doesn't match known statement keywords, try parsing an expression statement.
                // This allows function calls like PRINT(...) or potentially others to stand alone.
                try {
                    const expression = this.parseExpression();
                    // TODO: Should we add a check here to ensure it's a valid expression for a statement?
                    // For now, allow any expression to be a statement.
                    return { kind: 'ExpressionStatement', expression };
                } catch (error) {
                    // If parsing an expression fails here, THEN it's truly an unexpected token.
                    if (error instanceof ParserError) {
                         // Re-throw the original parser error for better context
                        throw error;
                    }
                     // Throw a generic error if it wasn't a ParserError (shouldn't happen often)
                    throw new ParserError(`Unexpected token type '${this.peek().type}' at start of statement or invalid expression.`, this.peek());
                }
        }
    }

    private parseLetStatement(): AST.LetStatement {
        this.consume(TokenType.LET, "Expected 'LET' keyword.");
        const nameToken = this.consume(TokenType.IDENTIFIER, "Expected variable name after 'LET'.");
        this.consume(TokenType.ASSIGN, "Expected '=' after variable name.");
        const value = this.parseExpression();
        // Optional: Expect END or newline? For now, assume simple structure.
        return { kind: 'LetStatement', variableName: nameToken.value, value };
    }

     private parseCallStatement(): AST.CallStatement {
        this.consume(TokenType.CALL, "Expected 'CALL' keyword.");
        const nameToken = this.consume(TokenType.IDENTIFIER, "Expected tool name after 'CALL'.");
        const args = this.parseArguments();
        return { kind: 'CallStatement', toolName: nameToken.value, arguments: args };
    }

    private parseIfStatement(): AST.IfStatement {
        this.consume(TokenType.IF, "Expected 'IF' keyword.");
        const condition = this.parseExpression();
        this.consume(TokenType.THEN, "Expected 'THEN' after IF condition.");

        const thenBlock: AST.Statement[] = [];
        while (!this.check(TokenType.ELSE) && !this.check(TokenType.END) && !this.isAtEnd()) {
            thenBlock.push(this.parseStatement());
        }

        let elseBlock: AST.Statement[] | undefined = undefined;
        if (this.match(TokenType.ELSE)) {
            elseBlock = [];
            while (!this.check(TokenType.END) && !this.isAtEnd()) {
                elseBlock.push(this.parseStatement());
            }
        }

        this.consume(TokenType.END, "Expected 'END' to close 'IF' statement.");
        return { kind: 'IfStatement', condition, thenBlock, elseBlock };
    }

     private parseForStatement(): AST.ForStatement {
        this.consume(TokenType.FOR, "Expected 'FOR' keyword.");
        const iteratorToken = this.consume(TokenType.IDENTIFIER, "Expected iterator variable name after 'FOR'.");
        this.consume(TokenType.IN, "Expected 'IN' after iterator variable.");
        const iterable = this.parseExpression();
        this.consume(TokenType.DO, "Expected 'DO' after iterable expression.");

        const loopBlock: AST.Statement[] = [];
        while (!this.check(TokenType.END) && !this.isAtEnd()) {
            loopBlock.push(this.parseStatement());
        }

        this.consume(TokenType.END, "Expected 'END' to close 'FOR' statement.");
        return { kind: 'ForStatement', iteratorVariable: iteratorToken.value, iterable, loopBlock };
    }

    // --- Argument Parsing for CALL ---

    private parseArguments(): Record<string, AST.Expression> {
        this.consume(TokenType.LBRACE, "Expected '{' to start arguments block.");
        const args: Record<string, AST.Expression> = {};
        if (!this.check(TokenType.RBRACE)) { // Check if block is not empty
            do {
                const keyToken = this.consume(TokenType.IDENTIFIER, "Expected argument name.");
                this.consume(TokenType.COLON, "Expected ':' after argument name.");
                const value = this.parseExpression();
                args[keyToken.value] = value;
            } while (this.match(TokenType.COMMA)); // Continue if comma is found
        }
        this.consume(TokenType.RBRACE, "Expected '}' to end arguments block.");
        return args;
    }


    // --- Expression Parsing (Recursive Descent with Precedence) ---

    private parseExpression(): AST.Expression {
        return this.parseLogicalOr(); // Start with lowest precedence (OR)
    }

    private parseLogicalOr(): AST.Expression {
        let expr = this.parseLogicalAnd();
        while (this.match(TokenType.OR)) {
            const operator = this.previous().type as AST.BinaryOperator; // Should be 'OR'
            const right = this.parseLogicalAnd();
            expr = { kind: 'BinaryOpExpr', operator, left: expr, right };
        }
        return expr;
    }

    private parseLogicalAnd(): AST.Expression {
        let expr = this.parseEquality();
        while (this.match(TokenType.AND)) {
            const operator = this.previous().type as AST.BinaryOperator; // Should be 'AND'
            const right = this.parseEquality();
            expr = { kind: 'BinaryOpExpr', operator, left: expr, right };
        }
        return expr;
    }

    private parseEquality(): AST.Expression {
        let expr = this.parseComparison();
        while (this.match(TokenType.EQ, TokenType.NE)) {
            const operator = this.previous().type as AST.BinaryOperator; // '==' or '!='
            const right = this.parseComparison();
            expr = { kind: 'BinaryOpExpr', operator, left: expr, right };
        }
        return expr;
    }

    private parseComparison(): AST.Expression {
        let expr = this.parseTerm(); // Parse higher precedence: +, -
        while (this.match(TokenType.GT, TokenType.GE, TokenType.LT, TokenType.LE)) {
             const operator = this.previous().type as AST.BinaryOperator; // '>', '>=', '<', '<='
            const right = this.parseTerm();
            expr = { kind: 'BinaryOpExpr', operator, left: expr, right };
        }
        return expr;
    }

    // Term handles Addition (+) and Subtraction (-)
    private parseTerm(): AST.Expression {
         let expr = this.parseFactor(); // Parse higher precedence first
         while (this.match(TokenType.PLUS, TokenType.MINUS)) {
            const operator = this.previous().type as AST.BinaryOperator; // '+' or '-'
            const right = this.parseFactor();
            expr = { kind: 'BinaryOpExpr', operator, left: expr, right };
         }
         return expr;
    }

    // Factor handles Multiplication (*) and Division (/)
    private parseFactor(): AST.Expression {
        // Factor now calls parseUnary, which handles postfix operations
        let expr = this.parseUnary();
        // Loop for multiplicative operators: *, /, %
        while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
            const operator = this.previous().type as AST.BinaryOperator; // '*' or '/' or '%'
            // Note: The right operand should also potentially handle postfix ops
            const right = this.parseUnary();
            expr = { kind: 'BinaryOpExpr', operator, left: expr, right };
        }
        return expr;
    }

    private parseUnary(): AST.Expression {
        // Handle unary PLUS and MINUS (as well as NOT)
        if (this.match(TokenType.NOT, TokenType.PLUS, TokenType.MINUS)) {
            const operator = this.previous().type as AST.UnaryOperator;
            // Unary operators typically apply to the result of the next highest precedence level,
            // which could potentially be another unary operation (e.g., - - 1)
            // or a primary expression.
            // Let's have unary parse unary for right-associativity (or simply primary if simpler).
            const operand = this.parseUnary(); // Recursively parse operand
            return { kind: 'UnaryOpExpr', operator, operand };
        }
        // If no unary operator, parse the next level down
        // Instead of primary, call postfix which handles primary AND subsequent [] . ()
        return this.parsePostfix(); // CHANGED: Call parsePostfix here
    }

    // NEW METHOD: Handles postfix operations like array indexing [], member access ., and function calls ()
    private parsePostfix(): AST.Expression {
        // First, parse the primary expression (the base)
        let expr = this.parsePrimary();

        // Then, loop to check for postfix operators
        while (true) {
            if (this.match(TokenType.LBRACKET)) {
                // Array index operator '['
                const index = this.parseExpression(); // Parse the index expression
                this.consume(TokenType.RBRACKET, "Expected ']' after array index expression.");
                // Create the ArrayIndexExpression node, using the current expression as the object
                expr = { kind: 'ArrayIndexExpression', object: expr, index };
            } else if (this.match(TokenType.DOT)) { // Enable DOT handling
                // Member Access operator '.'
                const propertyToken = this.consume(TokenType.IDENTIFIER, "Expected property name after '.'.");
                expr = { kind: 'MemberAccessExpr', object: expr, property: propertyToken.value };
            }
            /* // Future Extension: Function Call () - Needs more sophisticated argument parsing integration
             else if (this.match(TokenType.LPAREN)) {
                 // Parse arguments...
                 this.consume(TokenType.RPAREN, "Expected ')' after arguments.");
             */
            else {
                // No more postfix operators, break the loop
                break;
            }
        }

        return expr;
    }

    private parsePrimary(): AST.Expression {
        // Literals (TRUE, FALSE, NULL, NUMBER, STRING)
        if (this.match(TokenType.TRUE)) return { kind: 'LiteralExpr', value: true };
        if (this.match(TokenType.FALSE)) return { kind: 'LiteralExpr', value: false };
        if (this.match(TokenType.NULL)) return { kind: 'LiteralExpr', value: null };
        if (this.match(TokenType.NUMBER)) {
            return { kind: 'LiteralExpr', value: parseFloat(this.previous().value) };
        }
        if (this.match(TokenType.STRING)) {
            return { kind: 'LiteralExpr', value: this.previous().value };
        }

        // List Literal [ ... ]
        if (this.match(TokenType.LBRACKET)) {
          // Remove the previous placeholder error
          const elements: AST.Expression[] = [];
          if (!this.check(TokenType.RBRACKET)) { // Handle non-empty list
              do {
                  // Allow trailing comma: Check for RBRACKET immediately after LBRACKET or COMMA
                  if (this.check(TokenType.RBRACKET)) break;
                  elements.push(this.parseExpression());
              } while (this.match(TokenType.COMMA));
          }
          this.consume(TokenType.RBRACKET, "Expected ']' after list elements.");
          return { kind: 'ListLiteralExpr', elements }; // Return the new AST node
        }

        // Object Literal { ... }
        if (this.match(TokenType.LBRACE)) {
          const properties: Record<string, AST.Expression> = {};
          if (!this.check(TokenType.RBRACE)) { // Handle non-empty object
              do {
                  // Allow trailing comma
                  if (this.check(TokenType.RBRACE)) break;

                  let key: string;
                  // Key can be an identifier or a string literal
                  if (this.match(TokenType.IDENTIFIER)) {
                    key = this.previous().value;
                  } else if (this.match(TokenType.STRING)) {
                    key = this.previous().value; // Lexer already handled quotes/escapes
                  } else {
                    throw new ParserError("Expected identifier or string literal as object key.", this.peek());
                  }

                  this.consume(TokenType.COLON, "Expected ':' after object key.");
                  const value = this.parseExpression();
                  properties[key] = value;

              } while (this.match(TokenType.COMMA));
          }
          this.consume(TokenType.RBRACE, "Expected '}' after object properties.");
          return { kind: 'ObjectLiteralExpr', properties }; // Return the new AST node
        }


        // Handle IDENTIFIER, NOW, PRINT as potential function calls
        if (this.match(TokenType.IDENTIFIER, TokenType.NOW, TokenType.PRINT)) {
            const identifierToken = this.previous();
            // Check if it's a function call (IDENTIFIER/NOW/PRINT followed by LPAREN)
            if (this.match(TokenType.LPAREN)) {
                // Special check for NOW() which was handled differently before
                if (identifierToken.type === TokenType.NOW) {
                    // Consume RPAREN immediately for NOW, ensure no args passed in parser
                    this.consume(TokenType.RPAREN, "Expected ')' after 'NOW()'.");
                    return { kind: 'FunctionCallExpr', functionName: identifierToken.value, arguments: [] };
                }
                 // For IDENTIFIER or PRINT, parse arguments using helper
                return this.parseFunctionCallExpression(identifierToken);
            }
            // If it was IDENTIFIER without LPAREN, it's a variable access
            if (identifierToken.type === TokenType.IDENTIFIER) {
                 return { kind: 'VariableExpr', name: identifierToken.value };
            }
            // If it was NOW or PRINT without LPAREN, it's a syntax error
             throw new ParserError(`Expected '(' after '${identifierToken.value}' for function call.`, this.peek());
        }

        // Tool Calls used as expressions - Parsed by parseToolCallExpression
        if (this.check(TokenType.CALL)) {
             return this.parseToolCallExpression();
        }

        // Parenthesized expression
        if (this.match(TokenType.LPAREN)) {
            const expr = this.parseExpression();
            this.consume(TokenType.RPAREN, "Expected ')' after expression.");
            return expr;
        }

        // Error
        throw new ParserError(`Unexpected token type '${this.peek().type}' in expression parsing`, this.peek());
    }

    // NEW HELPER for generic function calls like NAME(arg1, arg2, ...)
    private parseFunctionCallExpression(nameToken: Token): AST.FunctionCallExpr {
        // LPAREN already consumed by the check in parsePrimary
        const args: AST.Expression[] = [];
        if (!this.check(TokenType.RPAREN)) { // Check if args are present
            do {
                // Allow trailing comma before RPAREN
                if (this.check(TokenType.RPAREN)) break;
                args.push(this.parseExpression());
            } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN, `Expected ')' after function arguments for '${nameToken.value}'.`);

        // Optional: Basic argument count checks at parse time (stricter checks in interpreter)
        if (nameToken.value === 'NOW' && args.length !== 0) {
            throw new ParserError(`Function NOW() expects no arguments, got ${args.length}`, nameToken);
        }
        // We won't add a check for FORMAT here, leave full validation to interpreter
        // We also won't add a check for PRINT here, interpreter will handle arg count.

        return { kind: 'FunctionCallExpr', functionName: nameToken.value, arguments: args };
    }

    // NEW HELPER for CALL used as an expression
    private parseToolCallExpression(): AST.ToolCallExpr {
         this.consume(TokenType.CALL, "Expected 'CALL' keyword."); // Already checked, but good practice
         const nameToken = this.consume(TokenType.IDENTIFIER, "Expected tool name after 'CALL'.");
         const args = this.parseArguments(); // Reuse argument parsing
         return { kind: 'ToolCallExpr', toolName: nameToken.value, arguments: args };
    }

    // --- Parser Helpers ---

    // Checks if the current token is of the given type(s) without consuming it.
    private check(...types: TokenType[]): boolean {
        if (this.isAtEnd()) return false;
        return types.includes(this.peek().type);
    }

    // Consumes the current token if it matches one of the given types.
    private match(...types: TokenType[]): boolean {
        if (this.check(...types)) {
            this.advance();
            return true;
        }
        return false;
    }

    // Consumes the current token if it's of the expected type, otherwise throws an error.
    private consume(type: TokenType, errorMessage: string): Token {
        if (this.check(type)) {
            return this.advance();
        }
        throw new ParserError(errorMessage, this.peek());
    }

    // Moves to the next token and returns the previous one.
    private advance(): Token {
        if (!this.isAtEnd()) {
            this.current++;
        }
        return this.previous();
    }

    // Checks if we've run out of tokens (ignoring EOF).
    private isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    // Returns the current token without consuming it.
    private peek(): Token {
        return this.tokens[this.current]!;
    }

    // Returns the most recently consumed token.
    private previous(): Token {
        return this.tokens[this.current - 1]!;
    }
}

/**
 * Convenience function to parse NuwaScript source code directly.
 * @param sourceCode The NuwaScript code string.
 * @returns The parsed Script AST node.
 * @throws LexerError or ParserError on failure.
 */
export function parse(sourceCode: string): AST.Script {
    const tokens = tokenize(sourceCode);
    const parser = new Parser(tokens);
    return parser.parse();
}
