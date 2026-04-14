# Content

`content/` is a standalone CMS + social publishing control plane for ClawJS.

This implementation intentionally ships:

- a Fastify backend backed by SQLite
- a dedicated CLI
- SDK and Relay integration through `claw.content`
- frontend contracts, fixtures, OpenAPI, and a reserved SPA mount in `content/ui/`
- backend, CLI, Relay, and placeholder browser E2E coverage

It intentionally does **not** ship the actual SPA yet. The frontend is specified through:

- `content/docs/frontend-checklist.md`
- `content/docs/api-openapi.json`
- `content/docs/fixtures/*.json`

## Local workflow

```bash
npm --prefix content ci
npm --prefix content run build
npm --prefix content run start
```

Default local credentials:

- email: `admin@content.local`
- password: `content-admin`

Default local URL:

- [http://127.0.0.1:4650](http://127.0.0.1:4650)
