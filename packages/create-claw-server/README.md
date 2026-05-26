# create-claw-server

Bootstrap a minimal headless Node.js server wired for Claw.

This package is a direct generator entrypoint. The primary documented flow is `claw new server my-claw-server`.

```bash
npx create-claw-server my-claw-server
```

For a local checkout instead of published ClawJS packages, run the generator
through source mode:

```bash
create-claw-server my-claw-server --source --source-root /path/to/clawjs
```

The generated server includes:

- a TypeScript Node.js HTTP server
- `@clawjs/claw` runtime wiring on the server side
- `claw` CLI scripts for local workspace bootstrap
- JSON routes for runtime status and sessions
- an SSE route for assistant reply event streaming

After generation:

```bash
cd my-claw-server
npm run claw:init
npm run dev
```

Switch the generated demo adapter to `openclaw` when you are ready to target a real runtime.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
