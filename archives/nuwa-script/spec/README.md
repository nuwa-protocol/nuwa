# Nuwa Script Specification

This directory contains the technical specifications for Nuwa Script, a scripting language designed for AI Agents to safely and reliably interact with external tools and services.

## Goal

Nuwa Script aims to provide a simple, secure, and extensible environment for AI models to execute tasks by invoking predefined tools (functions). It acts as a controlled interface between the AI's reasoning capabilities and the execution of potentially complex or sensitive operations.

## Key Features

*   **Simple Syntax:** Designed to be easily generated and understood by Large Language Models (LLMs).
*   **Tool-Based Extensibility:** Functionality is provided through "Tools," which are external functions registered with the Nuwa Script interpreter. This allows developers to safely expose specific capabilities to the AI.
*   **Security:** Incorporates mechanisms to control tool execution and resource access (details in `security.md`).
*   **Structured Execution:** Provides basic control flow constructs suitable for agentic workflows.

## Specification Documents

This directory details the following aspects of Nuwa Script:

*   **[Grammar](./grammar.md):** Defines the formal syntax of the Nuwa Script language.
*   **[Abstract Syntax Tree (AST)](./ast.md):** Describes the structure used to represent parsed Nuwa Script code.
*   **[Tools](./tools.md):** Explains the concept of Tools, how they are defined (Schema and Function), and how they interact with the interpreter and state.
*   **[Security](./security.md):** Discusses the security model, potential risks, and mitigation strategies.

This specification is intended for developers integrating Nuwa Script, building tools, or contributing to the language itself. 