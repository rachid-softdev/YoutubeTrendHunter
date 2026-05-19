---
name: coding-discipline
description: Enforce simple, minimal, and correct code changes with clear assumptions and verifiable outcomes.
license: MIT
---

## Core Rules

### Think before coding
- State assumptions if unclear
- Ask only if ambiguity blocks progress or risks incorrect implementation
- Do not silently choose between interpretations

### Simplicity first
- Implement only what is requested
- Avoid unnecessary abstractions
- Prefer the smallest working solution
- Do not introduce new dependencies unless strictly necessary

### Surgical changes
- Modify only what is required
- Do not refactor unrelated code
- Keep existing style

### Execution
- Define a clear success condition before coding
- Validate the result with a concrete check (test, reproducible step)

### Speed rule
- For trivial tasks, execute immediately without overthinking