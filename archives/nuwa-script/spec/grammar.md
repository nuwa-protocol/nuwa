# Nuwa Script Grammar Specification

This document defines the formal grammar of the Nuwa Script language using a notation similar to Extended Backus-Naur Form (EBNF).

## Notation

*   `UPPERCASE`: Keywords or predefined tokens.
*   `lowercase`: Non-terminal symbols (syntactic categories).
*   `'literal'`: Literal characters or strings.
*   `|`: Alternatives (OR).
*   `[]`: Optional elements (0 or 1 occurrence).
*   `{}`: Repetition (0 or more occurrences).
*   `()`: Grouping.

## Grammar Rules

```ebnf
script ::= { statement }

statement ::= let_statement
            | call_statement      // CALL as a top-level action
            | if_statement
            | for_statement
            | expression_statement // e.g., a standalone function call like PRINT(...)

let_statement ::= LET IDENTIFIER ASSIGN expression

call_statement ::= CALL IDENTIFIER LBRACE [ arguments ] RBRACE

if_statement ::= IF expression THEN statements [ ELSE statements ] END

for_statement ::= FOR IDENTIFIER IN expression DO statements END

statements ::= { statement }

arguments ::= argument { COMMA argument }

argument ::= IDENTIFIER COLON expression

expression_statement ::= expression // Allows expressions like PRINT() or potentially CALL() to be statements

expression ::= primary_expression
             | binary_op
             | unary_op
             | call_expression   // CALL used within an expression context
             | calc_expression
             | LPAREN expression RPAREN
             | member_access
             | element_access
             | function_call     // Built-in functions like NOW(), PRINT(), FORMAT()

primary_expression ::= literal
                     | variable

binary_op ::= expression ( PLUS | MINUS | MULTIPLY | DIVIDE ) expression // Arithmetic
            | expression ( EQ | NE | LT | LE | GT | GE ) expression    // Comparison
            | expression ( AND | OR ) expression                     // Logical
            // Note: Dot access is handled by member_access

unary_op ::= NOT expression
           | MINUS expression // Unary minus

member_access ::= expression DOT IDENTIFIER

element_access ::= expression LBRACKET expression RBRACKET // Index must evaluate to an integer

function_call ::= PRINT LPAREN expression RPAREN
                | NOW LPAREN RPAREN
                | FORMAT LPAREN expression COMMA expression RPAREN // FORMAT(template_string, values_object)

call_expression ::= CALL IDENTIFIER LBRACE [ arguments ] RBRACE

calc_expression ::= CALC LBRACE IDENTIFIER COLON STRING COMMA IDENTIFIER COLON object_literal RBRACE
                  // Corresponds to CALC { formula: "...", vars: { key: val, ... } }

literal ::= NUMBER
          | STRING      // Double-quoted strings: "example"
          | boolean_literal
          | NULL        // Lowercase: null
          | list_literal
          | object_literal

boolean_literal ::= TRUE | FALSE // Lowercase: true, false (Tokens defined by lexer)

list_literal ::= LBRACKET [ expression { COMMA expression } ] RBRACKET

object_literal ::= LBRACE [ object_entry { COMMA object_entry } ] RBRACE

object_entry ::= (IDENTIFIER | STRING) COLON expression

variable ::= IDENTIFIER
```

## Lexical Elements (Tokens)

The grammar relies on the following terminal symbols (tokens) provided by the lexer. **Case sensitivity is important.**

*   **Keywords (UPPERCASE):** `LET`, `CALL`, `IF`, `THEN`, `ELSE`, `END`, `FOR`, `IN`, `DO`, `CALC`, `AND`, `OR`, `NOT`
*   **Built-in Function Names (UPPERCASE):** `PRINT`, `NOW`, `FORMAT`
*   **Operators:**
    *   Assignment: `ASSIGN` (`=`)
    *   Arithmetic: `PLUS` (`+`), `MINUS` (`-`), `MULTIPLY` (`*`), `DIVIDE` (`/`)
    *   Comparison: `EQ` (`==`), `NE` (`!=`), `LT` (`<`), `LE` (`<=`), `GT` (`>`), `GE` (`>=`)
    *   Logical: `AND`, `OR`, `NOT` (also keywords)
    *   Access: `DOT` (`.`)
*   **Delimiters:** `LPAREN` (`(`), `RPAREN` (`)`), `LBRACE` (`{`), `RBRACE` (`}`), `LBRACKET` (`[`), `RBRACKET` (`]`), `COMMA` (`,`), `COLON` (`:`)
*   **Identifiers (Case-Sensitive):** `IDENTIFIER` (e.g., `variableName`, `tool_name`, `MyVar`) - typically starts with a letter or underscore, followed by letters, numbers, or underscores.
*   **Literals:**
    *   `NUMBER` (e.g., `123`, `45.6`, `-10`)
    *   `STRING` (e.g., `"hello world"`, `"escaped\"quote"`) - **Must use double quotes.**
    *   `BOOLEAN` (Represents the tokens `TRUE` and `FALSE`, which correspond to lowercase `true` and `false` literals in the script)
    *   `NULL` (Represents the lowercase `null` literal)

**Note:** Comments start with `//` and extend to the end of the line. They are ignored by the parser.
**Semantic Note:** The `+` operator is strictly for numerical addition. Use the `FORMAT` function for string concatenation or interpolation.
