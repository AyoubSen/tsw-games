# Working Agreement

## Core behavior

- Be concise.
- Prefer implementation over discussion.
- Do not restate the request.
- Do not explain obvious changes.
- Do not provide long summaries unless requested.
- Do not suggest unrelated improvements.
- Do not implement features that were not requested.
- Stop when the requested task is complete.

## Investigation

- Inspect only what is necessary to implement the task.
- Read relevant files and confirm local interfaces when required.
- When discussing or planning future features, check `ROADMAP.md` for prior suggestions. Treat it as a non-binding idea bank, not required work.
- Do not perform broad repository exploration without a concrete need.
- Do not repeatedly verify facts already established during the session.

## Commands and verification

Do not run any of the following unless explicitly requested:

- builds
- tests
- linters
- formatters
- type checks
- Git commands
- package installation
- development servers
- broad verification commands

Do not claim that commands passed when they were not run.

## Implementation

- Make the smallest coherent change that satisfies the request.
- Modify the minimum reasonable number of files.
- Follow existing project patterns.
- Avoid new abstractions unless they are currently necessary.
- Avoid helper files that provide little value.
- Avoid refactoring unrelated code.
- Do not clean up unrelated code.
- Do not add tests unless requested.
- Do not add documentation unless requested.
- Do not optimize performance unless requested.
- Do not future-proof speculative requirements.

## Decisions

- When multiple reasonable approaches exist, choose one and proceed.
- Do not present lengthy option lists unless asked.
- Ask a question only when a material requirement cannot reasonably be inferred.
- Briefly flag a serious flaw or substantially simpler solution before implementation.
- Otherwise proceed without debate.

## Token economy

Before writing something, ask:

- Does this help complete the requested task?
- Does it change the implementation?
- Was an explanation requested?

If not, omit it.

## Completion

A task is complete when the requested functionality exists and there are no obvious unresolved errors introduced by the change.

After completion:

- state what changed briefly
- mention anything intentionally not verified
- stop
