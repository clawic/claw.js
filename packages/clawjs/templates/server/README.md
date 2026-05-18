# __APP_TITLE__

Minimal headless Node.js server wired for ClawJS.

## Commands

```bash
npm install
npm run claw:init
npm run dev
```

## Endpoints

- `GET /health`
- `GET /api/claw/status`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions/:sessionId/messages`
- `POST /api/sessions/:sessionId/reply`
- `POST /api/sessions/:sessionId/stream`

## Example flow

```bash
curl http://localhost:3001/api/claw/status

curl -X POST http://localhost:3001/api/sessions \
  -H "content-type: application/json" \
  -d '{"title":"Demo","message":"Say hello from __APP_TITLE__"}'
```

## What is included

- TypeScript Node.js HTTP server
- `@clawjs/claw` runtime helper in `src/claw.ts`
- JSON routes for status and sessions
- SSE route for assistant reply event streaming
- `@clawjs/cli`-powered `claw` scripts for local workspace bootstrap

## Switch from demo to a real runtime

The starter uses the `demo` adapter so it works immediately. When you want a real runtime:

1. Change `demo` to `openclaw` in `package.json` scripts.
2. Change `demo` to `openclaw` in `src/claw.ts`.
3. Run `npm run claw:init` again if you want the workspace files regenerated for that adapter.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
