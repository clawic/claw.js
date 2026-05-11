# clawjs-badger

Generic publication framework. Author content, schedule it, fan it out to many destinations, observe what happens.

The canonical spec lives in [SPEC.md](./SPEC.md). This README is a one-pager.

## What is it

Badger models the universal concept of "publish content to a destination" so that:

- Agents (via the `badger` CLI) can author content, schedule it, queue it, fan it out to many destinations, and observe what happens.
- The data model is rich enough to cover every concept that an open-source self-hosted social media management tool models, plus capabilities those tools commonly omit (campaign as entity, decoupled editorial/publish state, A/B variants, locale-aware variants, idempotency keys, UTM templates, multi-stage approvals).
- Destinations are not limited to "social networks". A channel can be any addressable target with a declared capability descriptor: a social network, an RSS feed, a newsletter list, a chat community, a long-form blog, a forum, a podcast host, an event listing, an email broadcast, a push channel, a generic webhook.

## Quick start

```bash
npm install
npm run build
node dist/server.js               # serves on 127.0.0.1:4640 by default
node dist/cli.js workspaces list  # talks to the same loopback port
```

## Architecture

- Fastify 5 server on a loopback port.
- SQLite (better-sqlite3) at `<dataDir>/badger.sqlite`.
- Bearer-token auth (one ephemeral admin token issued at first boot, persisted at `~/.config/clawjs-badger/token`).
- Pluggable channel adapters under `src/server/channels/<family>/`.
- Job pipeline lives inside the same Fastify process by default (worker is a setInterval inside the server).
- WebSocket realtime emitter and outbound webhook fan-out share one canonical event envelope.

## Status

M0–M4 implemented in v0.1.0. M5 (concrete adapters) lands progressively. See SPEC.md §9 for the roadmap.
