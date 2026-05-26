# create-claw-agent

Bootstrap a minimal agent-first repository wired for Claw.

This package is a direct generator entrypoint. The primary documented flow is `claw new agent my-agent`.

```bash
npx create-claw-agent my-agent
```

For a local checkout instead of published ClawJS packages, run the generator
through source mode:

```bash
create-claw-agent my-agent --source --source-root /path/to/clawjs
```

The generated repo includes:

- a dedicated ClawJS agent workspace
- seeded runtime-facing files such as `SOUL.md`, `AGENTS.md`, `TOOLS.md`, `IDENTITY.md`, and `HEARTBEAT.md`
- a `CLAUDE.md` shim that redirects Claude Code back to the canonical `AGENTS.md` instructions
- memory and skills placeholders
- `@clawjs/claw` helper code for agent inspection and session demos
- `claw` CLI scripts for local workspace bootstrap

After generation:

```bash
cd my-agent
npm run claw:init
npm run agent:report
npm run agent:reply -- "Say hello"
```

Switch the generated demo adapter to `openclaw` when you are ready to target a real runtime.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
