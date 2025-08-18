# NuwaScript - TypeScript Implementation

This directory contains the TypeScript implementation of the NuwaScript interpreter, parser, and lexer.

For the detailed language specification (grammar, AST, tools, security), please refer to the [NuwaScript Specification](../../spec/README.md).

## Features

- Parses NuwaScript text into an Abstract Syntax Tree (AST).
- Interprets the AST, executing statements and evaluating expressions.
- Supports variables (`LET`), conditionals (`IF`/`THEN`/`ELSE`/`END`), loops (`FOR`/`IN`/`DO`/`END`).
- Supports basic operators (arithmetic `+`, `-`, `*`, `/`; comparison `==`, `!=`, `>`, `<`, `>=`, `<=`; logical `AND`, `OR`, `NOT`).
- Supports member access (`object.property`) and element access (`list[index]`).
- Handles built-in functions: `NOW()`, `PRINT(value)`, `FORMAT(template, values)`.
- Extensible tool calling mechanism (`CALL`) via a `ToolRegistry`.
- State Management: Tools can interact with a shared key-value state via the `ToolContext` provided during execution, enabling state awareness for AI agents.
- Basic error handling for runtime issues (type errors, undefined variables, tool errors).

## Setup

1.  **Navigate** to this directory:
    ```bash
    cd nuwa-script/implementations/typescript
    ```
2.  **Install Dependencies**: Use npm or yarn.
    ```bash
    npm install
    # or
    yarn install
    ```

## Building

To compile the TypeScript code to JavaScript (output to the `dist` directory, as configured in `tsconfig.json`):

```bash
npm run build
# or
yarn build
```

## Testing

Run the unit and integration tests using Jest:

```bash
npm test
# or
yarn test
```

This will execute the tests defined in the `tests/` directory.

## License

This project is licensed under the Apache License v2.0. See the [LICENSE](../../LICENSE) file in the root directory for details.