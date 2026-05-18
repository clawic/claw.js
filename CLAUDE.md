# CLAUDE.md

`AGENTS.md` is the canonical instruction file for this repository.

Read and follow:

1. `AGENTS.md`
2. `docs/host-ownership.md`
3. `docs/data-storage-boundary.md`
4. `docs/decision-map.md`
5. `docs/naming-style-guide.md`
6. `docs/agentic-naming-guide.md` and `docs/vocabulary.md` before adding or
   renaming files, classes, functions, JSON/YAML, Markdown, or shared domain
   terms
7. `docs/canonical-data-catalog.md` before changing built-in collections,
   schemas, fields, aliases, or relation semantics
8. `docs/adr/0001-claw-framework-host-boundary.md`
9. `docs/adr/0001-naming-and-stability-surfaces.md`
10. `docs/adr/0013-agentic-naming-and-code-structure.md`
11. `docs/adr/0005-canonical-data-catalog.md` before changing catalog policy
12. Any docs or wiki pages that `AGENTS.md` explicitly points to
13. The task-specific docs, tests, and code in the area you are changing
14. `docs/adr/0017-discoverability-and-meta-code-routing.md`,
    `docs/discoverability.md`, and `docs/discoverability.registry.json`
    before adding durable ADRs, skills, guardrails, harnesses, docs routers, or route work
15. `docs/adr/0022-remote-gateway-sync-redesign.md` before changing remote
    Gateway, Connector, Sync, Iroh, node trust, or remote parity surfaces

Critical guardrail for prompt-based tests:

- Keep prompts non-operative and text-only by default.
- Do not use prompts that can trigger local inspection, file reads, command execution, edits, deletions, or other host actions unless the test explicitly targets that capability in an isolated, approved harness.

If `CLAUDE.md` and `AGENTS.md` ever diverge, `AGENTS.md` wins.
