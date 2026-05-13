# ERP

`modules/erp/` is a standalone ERP backend for the ClawJS monorepo.

This first implementation intentionally ships:

- a transactional SQLite-backed backend
- a dedicated CLI
- shared API/frontend contracts
- a placeholder root page that reserves the future SPA mount at `modules/erp/ui/`
- backend, CLI, and browser-level E2E coverage

It intentionally does **not** ship the actual SPA yet. The frontend is
specified through:

- `docs/frontend-checklist.md`
- `docs/api-openapi.json`
- `docs/fixtures/*.json`

## Local workflow

```bash
npm --prefix modules/erp ci
npm --prefix modules/erp run build
npm --prefix modules/erp run start
```

Default local credentials:

- email: `admin@erp.local`
- password: `erp-admin`

Default local URL:

- [http://127.0.0.1:4530](http://127.0.0.1:4530)
