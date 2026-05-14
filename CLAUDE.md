# CLAUDE.md

`AGENTS.md` is the canonical instruction file for this repository.

Read and follow:

1. `AGENTS.md`
2. `docs/host-ownership.md`
3. `docs/data-storage-boundary.md`
4. `docs/decision-map.md`
5. `docs/naming-style-guide.md`
6. `docs/canonical-data-catalog.md` before changing built-in collections,
   schemas, fields, aliases, or relation semantics
7. `docs/adr/0001-claw-framework-host-boundary.md`
8. `docs/adr/0001-naming-and-stability-surfaces.md`
9. `docs/adr/0005-canonical-data-catalog.md` before changing catalog policy
10. Any docs or wiki pages that `AGENTS.md` explicitly points to
11. The task-specific docs, tests, and code in the area you are changing

Critical guardrail for prompt-based tests:

- Keep prompts non-operative and text-only by default.
- Do not use prompts that can trigger local inspection, file reads, command execution, edits, deletions, or other host actions unless the test explicitly targets that capability in an isolated, approved harness.

If `CLAUDE.md` and `AGENTS.md` ever diverge, `AGENTS.md` wins.
