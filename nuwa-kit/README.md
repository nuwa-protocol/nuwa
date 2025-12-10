# Nuwa Kit - Development Kits for Nuwa Protocol

This directory contains Software Development Kits (SDKs) and Service Development Kits (Service Kits) for building applications and services on the Nuwa protocol. It provides tools for various programming languages and environments.

The goal of Nuwa Kit is to provide developers with easy-to-use libraries, frameworks, and tools to:

- Build client applications that interact with Nuwa.
- Develop backend services that extend or integrate with the Nuwa ecosystem.

## Language Implementations

Within this kit, you will find language-specific directories. Each directory may contain:

- **Client SDKs:** For building user-facing applications (web, mobile, desktop).
- **Service Kits:** Frameworks and libraries for developing Nuwa-compatible services (e.g., Agent-to-Agent services, Oracle services, Custodian services).
- **Shared Libraries:** Common utilities and core types used by both client and service components within that language.

Currently, the following language implementations are planned or under development:

- **[TypeScript](./typescript/)**: For JavaScript/TypeScript environments, including web browsers and Node.js. This can be used for both client-side SDKs and service-side development (e.g., A2A frameworks).
- **[Python](./python/)**: For Python applications, scripting, and service development.
- Other languages (e.g., Swift, Java, Go) may be added in the future.

## Core Functionalities Provided

Depending on the specific language and package, Nuwa Kit aims to provide:

**For Client-Side Development:**

- Interacting with Nuwa smart contracts.
- Managing agent identities and capabilities.
- Creating and managing tasks.
- Securely communicating with Nuwa services.

**For Service-Side Development:**

- Frameworks for building standardized Nuwa services (e.g., Agent-to-Agent communication protocols).
- Libraries for interacting with the Nuwa blockchain from a service context.
- Tools for message handling, data validation, and service registration.
- Boilerplate and utilities for common service patterns.

Please refer to the README file within each specific language directory (e.g., `./typescript/README.md`, `./python/README.md`) for more detailed information on the available packages, installation, usage, and contribution guidelines.
