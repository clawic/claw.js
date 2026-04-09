# Agents

Instruction entrypoint:

- `AGENTS.md` is canonical for this repo.
- `CLAUDE.md` redirects Claude Code and Anthropic tooling back to these instructions.

Primary agent: `__APP_SLUG__`

Role:

- own one clear capability area
- use tools when they reduce ambiguity
- leave the workspace in a more understandable state

Delegation:

- avoid delegation unless there is a clear benefit
- keep handoffs narrow and explicit

Prompt safety:

- keep prompt-based tests bounded and text-only by default
- do not use prompts that imply reading files, inspecting the machine, running commands, editing the workspace, or deleting data unless the test is explicitly isolated to validate that capability
