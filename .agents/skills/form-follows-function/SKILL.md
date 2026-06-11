---
name: form-follows-function
description: >-
  pragmatic code generation and architecture guidance for writing, refactoring, or reviewing software. use when the user asks for code, implementation plans, coding-agent prompts, refactors, architecture, clean architecture, hexagonal/clean architecture, sicp-style design, functional/declarative code, maintainability, modularity, dependency injection, tests, or code quality. applies across languages, with typescript as the default when no stack is specified. optimize for code whose structure follows the task: simple for simple work, layered for complex work, compositional without overengineering.
---

Motivation: This skill exists because the user wants code that is understandable, sophisticated, and pragmatic without turning every task into architecture theater. The root motivation is to make software structure follow the real shape of the problem: simple work should stay simple, complex work should gain boundaries, and long-lived systems should become compositional, testable, and easy to change. The goal is not to force SICP, Clean Architecture, functional programming, or hexagonal architecture everywhere. The goal is to use those ideas only when they reduce coupling, clarify behavior, isolate side effects, and make the code easier to reason about over time.

Give code, implementation plans, reviews, or coding-agent instructions where form follows function.

Rules:

- Start from the task shape: script, component, endpoint, feature slice, domain workflow, system, refactor, or review.
- Match structure to complexity. Use direct functions for simple work, pure core plus use case for feature work, and hexagonal/clean architecture for workflows with domain rules, persistence, external APIs, retries, or lifecycle risk.
- Prefer the smallest design that preserves clarity, testability, and changeability.
- Use SICP-style decomposition: small named transformations, explicit data flow, composable functions, and side effects pushed to the edges.
- Prefer functional and declarative code where it clarifies the program. Do not contort naturally stateful workflows into fake purity.
- Keep business rules out of UI components, route handlers, controllers, database adapters, SDK clients, and framework glue.
- Separate pure decision logic from effects such as databases, queues, HTTP clients, SDKs, clocks, random IDs, logging, files, and payments.
- Use dependency injection through explicit parameters, ports, or small interfaces. Do not hide important capabilities behind globals.
- Use Clean Architecture only when it earns its place: entities, use cases, interface adapters, frameworks, dependency inversion, and boundary separation must reduce real coupling, clarify policy, or make change easier.
- Use hexagonal architecture only when boundaries matter. Keep domain inward, application orchestration around it, ports as contracts, adapters as external implementations, and framework code at the edge.
- Prefer small files and small functions with one reason to change.
- Encode valid states with types where practical. Use discriminated unions for meaningful states and expected failures.
- Validate at trust boundaries: HTTP input, webhooks, CLI input, environment variables, files, and external API responses.
- Use typed results for expected failures and exceptions for impossible or unexpected failures.
- Add tests where behavior can break: domain rules, branching, parsing, matching, idempotency, retries, state transitions, and use cases with fake ports.
- Avoid premature factories, managers, registries, base classes, generic platforms, unused interfaces, and abstractions with only one weak reason to exist.
- Do not overengineer. If the user asks for a small thing, write the small thing well.
- For TypeScript, default to strict TypeScript, Zod at boundaries, server-side use cases, injected adapters, and minimal client state.
- If the language is not algebra or functional enabled like Rust or TS, then still follow being declarative and compositional (e.g., with Python, Go, C, C++, etc.).
- When reviewing or tightening code, consult `references/review-checklist.md` if a compact quality gate would help.

Outputs:

1. Task shape: briefly classify the problem size and the structure it deserves.
2. Architecture choice: state the minimum viable structure and why it is enough.
3. File tree: include only files that need to exist.
4. Core code: provide small, typed, compositional implementation units.
5. Boundaries: show how framework, database, API, or SDK details are isolated.
6. Tests: include tests for rules, use cases, idempotency, or state transitions when relevant.
7. Omitted complexity: name what was intentionally not built or abstracted.
8. Quality check: briefly verify that the solution is simple enough, testable, and not pattern-driven.
