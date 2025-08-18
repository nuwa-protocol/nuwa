# NuwaScript: The Language of Agent Intent

NuwaScript is a lightweight, structured, and cross-platform scripting language designed specifically for AI Agents. It enables AI to generate interpretable, executable, and auditable sequences of logic and actions, acting as the language of Agent intent and action.

Its goal is to empower AI Agents to act autonomously, safely, and transparently across diverse platforms, including web environments and blockchains.

---

## 🧭 Why NuwaScript?

In the age of AI Agents, traditional programming languages fall short in one critical dimension:

> ❌ They are designed for humans to write, but not for AIs to plan, explain, and execute actions autonomously.

**NuwaScript** is a purpose-built scripting language designed from the ground up for **AI-generated behavior planning**. It addresses the growing need for:

- ✅ A structured, safe, and deterministic way for AI to express action plans  
- ✅ Seamless coordination between tools, conditions, variables, and memory  
- ✅ Executable logic that can be interpreted in any environment — off-chain or on-chain  
- ✅ Transparent, auditable, and resumable workflows powered by AI logic

While existing languages like Python or JSON-based schemas are human-friendly, they are either **too powerful (unsafe for autonomous execution)** or **not expressive enough (lacking control flow, conditional logic, and native tool integration).**

What makes NuwaScript unique is that it helps **AI overcome its own cognitive limits**.

> 💡 AI models are good at generating thoughts — not at precisely invoking multi-step tools.  
> With NuwaScript, AI can **outsource execution to a script**, making tool usage verifiable, repeatable, and explainable.

**NuwaScript is different**. It's not a general-purpose language — it's a **goal-oriented, declarative behavior language** that:

- Describes what an AI agent intends to do  
- Defines when it should do it (conditions, timing)  
- Expresses how it interacts with external tools  
- Allows interruption, continuation, and reasoning around state

In short:  
> 🧠 **NuwaScript is the language of executable intent.**  
> It gives AI agents a clear, verifiable, and programmable way to act — not just speak.

---

## 📜 Specification

The detailed technical specification for the NuwaScript language, including its grammar, Abstract Syntax Tree (AST) structure, Tool system, and security model, can be found in the [**`/spec` directory**](./spec/README.md).

---

## ✨ Core Features

*   **Simple & AI-Friendly Syntax:** Designed to be easily generated and understood by Large Language Models (LLMs).
*   **Structured Control Flow:** Supports variable binding (`LET`), conditionals (`IF`/`THEN`/`ELSE`/`END`), and list iteration (`FOR`/`IN`/`DO`/`END`).
*   **Tool-Based Extensibility:** Core functionality is provided through external "Tools" invoked via `CALL`, allowing controlled interaction with any environment.
*   **Built-in Functions:** Includes essential functions like `PRINT`, `NOW`, and `FORMAT`.
*   **State Management:** Tools can interact with a shared state via `ToolContext`, enabling state awareness for AI agents.
*   **Safety-Oriented:** Designed to prevent arbitrary code execution, with interactions mediated strictly through tools (See [Safety](#safety)).
*   **Platform Agnostic:** Can be implemented and executed in various environments.

---

## 💡 Core Syntax Overview

```nuwa
// Variable assignment (supports primitives, lists, objects)
LET counter = 0
LET isActive = true
LET config = { threshold: 0.75, name: "default" }
LET items = [10, "data", false, null]

// Using built-in functions
PRINT("Starting process...")
LET msg = FORMAT("Processing item {index} of {total}", { index: counter, total: items.length })
PRINT(msg)
LET timestamp = NOW()

// Tool invocation (the primary way to interact)
LET result = CALL process_item { item: items[0], config: config }
CALL log_event { type: "process_result", data: result, time: timestamp }

// Conditional logic
IF result.status == "success" AND result.value > config.threshold THEN
  PRINT("High value success!")
  CALL trigger_alert { level: "high", value: result.value }
ELSE
  PRINT("Condition not met or process failed.")
END

// Looping through a list
FOR item IN items DO
  PRINT(FORMAT("Looping - item: {i}", {i: item}))
  CALL process_item { item: item, config: config }
END

PRINT("Script finished.")
```
*(Refer to the [Grammar Specification](./spec/grammar.md) for full details)*

---

## 🧰 Tool Ecosystem

The power and safety of NuwaScript come from its Tool-centric design. All interactions with the outside world (APIs, databases, blockchains, UI elements) are handled by Tools defined by the host application and invoked using `CALL`.

Learn more about defining and using tools in the [**Tools Specification**](./spec/tools.md).

---

## 🚀 Implementations

NuwaScript is designed to be implemented in various languages to suit different execution environments. We envision support for multiple backends, **including Move for on-chain smart contract execution**.

Currently available implementations:

*   **[TypeScript](./implementations/typescript/README.md):** The primary and most up-to-date implementation, actively used for experimentation and development. Includes parser, interpreter, and tooling.

---

## 🚧 Safety

Security is a fundamental design principle. NuwaScript mitigates risks by having a limited core syntax and mandating that all external actions occur through well-defined, host-controlled Tools.

Read the detailed discussion in the [**Security Model Specification**](./spec/security.md).

---

## 🎮 Try NuwaScript

Experience NuwaScript interactively in the [**NuwaScript Playground**](https://playground.nuwa.dev/).

---

## 📜 License

This project is licensed under the Apache License v2.0. See the [LICENSE](../LICENSE) file for details.

Let's define the next generation of executable AI intent together!
