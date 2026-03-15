# Agora Engineering Rules

## Project role
This repo implements Agora MVP strictly from frozen specs.

## Source of truth
1. docs/spec/CORE_SPEC.md
2. docs/spec/BUILD_ORDER.md
3. current docs/tasks/TASK-XXX.md

## Hard rules
- Do not invent schema fields, states, SSE events, or prompt semantics.
- Do not modify docs unless explicitly asked.
- Do not work on Web during Phase A.
- Put shared business logic in src/lib only.
- CLI and Web must share core logic.
- If spec is missing, stop and report a gap.

## Execution pattern
- Read only the current task and relevant spec files.
- Implement minimal changes.
- Run lint, typecheck, and tests.
- Report changed files, acceptance results, and risks.

## Commands
- pnpm lint
- pnpm typecheck
- pnpm test
