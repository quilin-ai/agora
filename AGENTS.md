# AGENTS.md

## Purpose

This repository uses `技术文档.md` as the current source of truth for product and engineering scope.

When working with tasks, specs, progress files, and implementation sequencing, always align naming, references, and execution order to `技术文档.md`.

---

## Task Naming Rules

Use the following naming rules for files under `docs/tasks/` and for task references in specs, progress files, prompts, reviews, and implementation notes.

### 1. Core Numbered Tasks

Use plain numbered task names for primary module or foundation tasks.

Examples:

- `Task-001`
- `Task-002`
- `Task-004`
- `Task-005`
- `Task-008`

Meaning:

- These are the main work packages in the build order.
- They usually map to a core subsystem, platform foundation, or major functional block.

### 2. Numbered Extension Tasks

Use the exact extension task names defined in `技术文档.md`.

Examples:

- `Task-001a`
- `Task-002a`

Meaning:

- These tasks are explicit extension tasks in the official Task Graph.
- They are not automatically parallel tasks.
- Whether they can run in parallel is determined by dependencies, not by the name.

### 3. Phase Integration Tasks

Use the exact phase integration names defined in `技术文档.md`.

Examples:

- `Task-A1-E2E`
- `Task-A2-chat`
- `Task-A2-tools`
- `Task-A2-event`
- `Task-A2-test`
- `Task-015-CLI`

Meaning:

- These tasks belong to a specific delivery phase or sub-phase.
- They are not low-level module tasks.
- They usually represent integration, validation, orchestration, tooling, or final stabilization work.

### 4. File Naming Convention

For task markdown files inside `docs/tasks/**`, use the exact task ids from `技术文档.md`.

Examples:

- `TASK-001.md`
- `TASK-001a.md`
- `TASK-002a.md`
- `TASK-A1-E2E.md`
- `TASK-A2-chat.md`
- `TASK-015-CLI.md`

Avoid:

- renamed aliases that do not exist in `技术文档.md`
- mixed styles where some files use official ids and others use invented descriptors

### 5. Reference Consistency

When renaming any task file or task label:

- update all inbound references in `docs/spec/`
- update all phase progress files
- update `docs/tasks/README.md` if the task list or naming summary changes
- update dependency text inside affected task files

Do not leave stale references to old task names.

---

## Phase Documentation Rules

Each official phase progress file should map to the Task Graph phases in `技术文档.md`: `phase-a1/`, `phase-a2/`, `phase-b/`, `phase-c/`.

It should include:

- phase summary
- phase goals
- final deliverables
- in-scope items
- out-of-scope items
- current status
- task progress list
- links to task documents

The progress file should be understandable on its own by a human reviewer without requiring them to open every task file first.

---

## Implementation Planning Rules

When discussing or updating execution order:

- distinguish between main module tasks and phase integration tasks
- do not imply that extension tasks are parallel only because they were previously labeled with `a`
- use explicit dependency reasoning
- keep Phase A1, Phase A2, Phase B, and Phase C clearly separated

Current product sequencing:

1. Phase A1: minimal engine loop
2. Phase A2: hardened CLI and complete Phase A validation
3. Phase B: Web minimal shell
4. Phase C: productization

Do not invent extra delivery phases beyond the Task Graph in `技术文档.md` unless the source-of-truth document is explicitly changed.
