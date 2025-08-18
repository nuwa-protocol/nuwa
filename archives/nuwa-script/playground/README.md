# NuwaScript Playground

Welcome to the NuwaScript Playground! This is an interactive web application designed for exploring, testing, and demonstrating the NuwaScript language and its TypeScript implementation.

**You can access the live Playground at: [https://playground.nuwa.dev/](https://playground.nuwa.dev/)**

It provides a hands-on environment to:

*   Learn NuwaScript syntax interactively.
*   Experiment with calling different Tools.
*   Use an AI assistant (powered by OpenAI) to generate NuwaScript code based on natural language prompts.

This Playground is built using **Vite, React, and TypeScript**, and it utilizes the core NuwaScript interpreter found in the [TypeScript implementation](../implementations/typescript/). For detailed language specifications, refer to the [NuwaScript Spec](../spec/).

## Features

*   **Interactive Editor:** Code editor with NuwaScript syntax highlighting.
*   **Live Execution:** Run NuwaScript code directly in the browser and see real-time output.
*   **Multiple Examples:** Explore pre-configured examples demonstrating various use cases and tool sets (e.g., Canvas Drawing, Trading Assistant).
*   **Tool Inspection:** View the schemas and descriptions of tools available in each example.
*   **AI Assistant:** Generate NuwaScript code from prompts using the OpenAI API (requires your own API key).
*   **Client-Side:** Runs entirely in your browser, no backend required.

## Quick Start

### 1. Navigate to the Directory

```bash
cd nuwa-script/playground
```

### 2. Install Dependencies

Ensure you have Node.js and npm (or yarn) installed.

```bash
npm install
# or
yarn install
```

### 3. Start the Development Server

```bash
npm run dev
# or
yarn dev
```

This will typically start the server and open the Playground in your browser at `http://localhost:5173` (or another port if 5173 is busy).

## Usage Guide

1.  **Select Example:** Choose an example scenario (e.g., Canvas, Trading) from the left sidebar. This loads the relevant tools and a sample script into the editor.
2.  **Write/Edit Script:** Modify the NuwaScript code in the central editor panel.
3.  **Run:** Click the "Run" button to execute the current script using the NuwaScript TypeScript interpreter.
4.  **Use AI Assistant:**
    *   Open the AI Assistant panel.
    *   Enter your OpenAI API Key (this is stored locally in your browser's storage only and is not sent anywhere else besides OpenAI).
    *   Type a request (e.g., "Draw a red circle next to the blue square" in the Canvas example). The AI will attempt to generate the corresponding NuwaScript code based on the tools available in the selected example.

## Adding New Examples

You can easily add new scenarios:

1.  Create a new example configuration file (e.g., `myExample.ts`) in `src/examples/`.
2.  Define the `ToolSchema` and `ToolFunction` implementations for your example's tools.
3.  Create an `ExampleConfig` object, including an ID, name, description, sample script, the list of tools, and any specific AI prompts or state managers.
4.  Import and add your `ExampleConfig` to the `examples` array in `src/examples/index.ts`.

## License

This project is licensed under the Apache License v2.0. See the [LICENSE](../../LICENSE) file in the root directory for details.
