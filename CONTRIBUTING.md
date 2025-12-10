# Contributing to Nuwa Protocol

First off, thank you for considering contributing to the Nuwa Protocol! We welcome contributions from everyone. This document provides guidelines to help you contribute effectively.

## Table of Contents

- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Coding Guidelines](#coding-guidelines)
- [Nuwa Improvement Proposals (NIPs)](#nuwa-improvement-proposals-nips)
- [Code of Conduct](#code-of-conduct)
- [Questions?](#questions)

## How to Contribute

We use GitHub to manage issues and feature requests, as well as to accept contributions via pull requests.

### Reporting Bugs

If you find a bug, please ensure the bug was not already reported by searching on GitHub under [Issues](https://github.com/nuwa-protocol/nuwa/issues).

If you're unable to find an open issue addressing the problem, [open a new one](https://github.com/nuwa-protocol/nuwa/issues/new). Be sure to include a **title and clear description**, as much relevant information as possible, and a **code sample or an executable test case** demonstrating the expected behavior that is not occurring.

### Suggesting Enhancements

If you have an idea for an enhancement or a new feature, please outline your proposal in a GitHub issue.

- Provide a clear and detailed explanation of the feature.
- Explain why this enhancement would be useful to Nuwa users and is consistent with the project's goals.
- If possible, provide examples of how the feature might be used.

For significant protocol changes or new features, please refer to the [Nuwa Improvement Proposals (NIPs)](#nuwa-improvement-proposals-nips) process.

### Your First Code Contribution

Unsure where to begin contributing to Nuwa? You can start by looking through these `good first issue` and `help wanted` issues:

- [Good first issues](https://github.com/nuwa-protocol/nuwa/labels/good%20first%20issue) - issues which should only require a few lines of code, and a test or two.
- [Help wanted issues](https://github.com/nuwa-protocol/nuwa/labels/help%20wanted) - issues which should be a bit more involved than `good first issues`.

### Pull Requests

1.  **Fork the repository** and create your branch from `main`.
2.  **Set up your development environment** (see [Development Setup](#development-setup)).
3.  **Make your changes.** Ensure your code adheres to the [Coding Guidelines](#coding-guidelines).
4.  **Add tests** for your changes. We aim for a high degree of test coverage.
5.  **Ensure all tests pass.**
6.  **Update documentation** if you've changed APIs, added new features, or made other relevant changes.
7.  **Write clear, concise commit messages.** We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.
8.  **Open a pull request** to the `main` branch of the `nuwa-protocol/nuwa` repository.
    - Clearly describe the problem and solution. Include the relevant issue number if applicable.
    - Ensure your PR passes all CI checks.

## Development Setup

The Nuwa project is a monorepo containing multiple components (smart contracts, SDKs, services) written in different languages (Move, TypeScript, Python, Rust, etc.).

Please refer to the `README.md` file within the specific subdirectory you are working on for detailed setup instructions. For example:

- For Move smart contracts, see `contracts/move/README.md`.
- For TypeScript SDKs/services, see `nuwa-kit/typescript/README.md`.
- For Python components, see `nuwa-kit/python/README.md`.

Generally, you will need the relevant toolchains for the language you are working with.

## Coding Guidelines

- **Consistency:** Try to maintain consistency with the existing codebase.
- **Clarity:** Write clear, understandable, and maintainable code. Add comments where necessary to explain complex logic.
- **Testing:** All contributions should include tests.
- **Linting & Formatting:** Ensure your code adheres to the project's linting and formatting standards. We use tools like ESLint/Prettier for TypeScript, Black/Flake8 for Python, and `cargo fmt` for Rust. Configuration files for these tools are typically found in the respective subdirectories.
- **Commit Messages:** Follow the [Conventional Commits](https://www.conventionalcommits.org/) style.

## Nuwa Improvement Proposals (NIPs)

For substantial changes to the Nuwa protocol, its core components, or to introduce new standards, we use the Nuwa Improvement Proposal (NIP) process. Please see the [nips/README.md](https://github.com/nuwa-protocol/NIPs/blob/main/README.md) and [nips/NIPs/nip-0.md](https://github.com/nuwa-protocol/NIPs/blob/main/nips/NIPs/nip-0.md) for details on how to propose and discuss NIPs.

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all. While we don't have a formal Code of Conduct document yet, we expect all contributors to interact respectfully and professionally. Harassment or exclusionary behavior will not be tolerated.

(We plan to adopt a formal Code of Conduct in the future. If you have suggestions, please open an issue.)

## Questions?

If you have any questions, feel free to open an issue or reach out to the maintainers.

Thank you for contributing!
