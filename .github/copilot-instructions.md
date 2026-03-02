# GitHub Copilot Instructions

This file contains essential project-specific conventions, coding standards, and architectural decisions that must be followed when contributing to this VS Code project.
It provides guidance for LLM (Large Language Model) engines and AI agents working on or with this project.

Key reminders:
- Follow the structure and conventions in existing code and documentation
- Avoid using `any` type; prefer strong typing
- Use small, prefer composable modules and pure functions or interfaces and classes where appropriate

## Project Overview
- This is a VS Code extension for translating Markdown, JSON, YAML, and TypeScript files using AI translation services (draft/MVP) and professional translation services (final).
- It supports multiple translation engines.
  - Translation engines include Azure, Google, DeepL, OpenRouter, Gemini, and a 'Copy' which is a non-translating engine.
- Some engines support context aware translations.
- The extension is written in TypeScript and uses native modules (better-sqlite3) for caching.
- It supports translating both directory structures and individual files, with flexible source path configuration.

## MCP

- Use git commands (not MCP) when instructed to create commits.

## Key Conventions
- Use pnpm for dependency management and scripts (see package.json).
- Use 'pnpm' for running package.json scripts (e.g., `pnpm build`, `pnpm test`).
- Use `tsc` for TypeScript compilation (see tsconfig.json).
- Use `vitest` for unit testing (see vitest.config.ts).
- Use `eslint` for linting (see .eslintrc.json).
- Use `prettier` for code formatting (see .prettierrc).
- Follow VS Code extension development best practices (see CONTRIBUTING.md).
- All product code is in the `src/` directory.
- All tests are in the `tests/` directory and use Vitest.

## Coding Style
- Use strict TypeScript typing; avoid `any` type
- Use static typing and interfaces to define clear contracts and avoid dynamic type checking where possible
- Prefer small, composable modules and pure functions
- Functions should be small, ideally under 20 lines.
- If a function exceeds 40 lines, break it up immediately.
- Avoid deep nesting of code (more than 3 levels).
- Use early returns to reduce nesting.
- Avoid side effects in functions; they should not modify external state.
- Functions should have clear input parameters and return values.
- Avoid global state; use dependency injection where possible.
- Avoid hardcoding values; use configuration files or environment variables.
- Write code for readability and maintainability.
- Code must be built for reuse, not just to "make it work."

# Modular Design
- Code should connect like Lego - interchangeable, testable, and isolated.
- Ask: "Can I reuse this class in a different green or project?" If not, refactor it.
- Reduce tight coupling between components. Favor dependency injection or protocols.
- Design for extension and modification without changing existing code.
- Use interfaces and types to define clear contracts between components.

# Scalability Mindset
- Always code as if someone else will scale this.
- Include extension points (e.g., protocol conformance, dependency injection) from day one.

## Naming Conventions
- Use camelCase for variables and functions.
- Use PascalCase for classes and types.
- Use UPPER_SNAKE_CASE for constants.
- Use clear, descriptive names that reflect the general purpose rather than specific use cases.
- Avoid abbreviations unless they are widely understood.
- All class, method, and variable names must be descriptive and intention-revealing.
- Avoid vague names like data, info, helper, or temp.
- if the name requires a comment to explain it, rename it.

## Testing
- Write unit tests for all functions and classes (aim for 100% coverage).
- Use mocks and stubs to isolate components in tests.
- Tests should be fast and reliable; avoid external dependencies.
- Use descriptive names for test cases and organize them logically.
- Don't treat a solution as complete until it has comprehensive tests and that all tests are passing.
- Don't alter tests to just make them pass; fix the underlying issue instead.

# File length and structure
- Never allow a file to exceed 500 lines.
- If a file approaches 400 lines, break it up immediately.
- Treat 1000 lines as unacceptable, even temporarily.
- Use folders and naming conventions to keep small files logically grouped.
- Keep functions under 30-40 lines.
- If a class is over 200 lines, assess splitting into smaller helper classes.

# Single responsibility principle
- Every file, class, and function should do one thing only.
- If it has multiple responsibilities, split it immediately.
- Favor composition over inheritance, but always use object-oriented thinking.
- Use interfaces and types to define clear contracts between components.

# Source Control & CI/CD
- Use Git for version control and follow standard Git workflows (see CONTRIBUTING.md).
- Follow semantic versioning for releases (see package.json).
- Use GitHub Issues and Pull Requests for tracking changes and collaboration.
- Use GitHub Actions for CI/CD (see .github/workflows/).

## Native Modules
- Consider Electron ABI compatibility for native modules
  - SQLite uses better-sqlite3 which is a native module
  - We've added code to rebuild native modules for the Electron version used by VS Code and for unit tests
- Native modules must be rebuilt for the Electron version used by VS Code (see CONTRIBUTING.md for instructions).

## Project specific conventions
- The translation pipeline is managed in `src/pipeline.ts`.
- Path handling utilities are in `src/util/paths.ts`.
- Extractors for file formats are in `src/extractors/`.
- Translation engine adapters are in `src/translators/`.
- Context CSV handling is in `src/contextCsv.ts`.
- Shared logic for structured data (JSON/YAML) is in `src/extractors/structured.ts`.
- Configuration is loaded from `translator.json` or VS Code settings (see `src/config.ts`).
- The translation cache uses SQLite via better-sqlite3 (see `src/cache.ts
- Maintain language neutrality in code - don't assume English (or any specific language) is always the source language

## Coding Guidelines
- TypeScript strict mode is enabled. Use strong typing and avoid `any` where possible.
- Prefer small, composable modules and pure functions.
- Do not use VS Code API inside translation engine adapters.
- Use meaningful variable names and include doc comments for exported functions.
- Maintain language neutrality in code - don't assume English (or any specific language) is always the source language.
- Use clear, descriptive function and variable names that reflect their general purpose rather than specific use cases.
- Follow the structure and conventions in existing code and documentation.

## Documentation
- Documentation is in README.md, CONTRIBUTING.md and doc/*.md files.
- Features, usage, and configuration are described in README.md and doc/Configuration.md.
- The configuration allows flexible source path setup via `translator.json`:
  - Directory paths (e.g., "i18n/en") for translating entire directory structures
  - Individual file paths (e.g., "i18n/en.json") for single file translation to sibling files
- Native module and development environment setup is described in CONTRIBUTING.md.

## Special Notes for LLMs
- When generating code, ensure compatibility with VS Code extension APIs and Electron.
- When updating dependencies or native modules, always consider Electron ABI compatibility.
- When adding new extractors or translation engines, follow the patterns in `src/extractors/` and `src/translators/`.
- For context-aware translation, ensure context CSVs are loaded and mapped correctly (see `src/contextCsv.ts`).
- When working with source and target paths, always use language-neutral functions and terminology.
- Remember that source paths can be both directories and individual files, so path handling code must support both scenarios.
