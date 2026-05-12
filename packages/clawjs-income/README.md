# @clawjs/income

Income streams and side hustles

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Income.
- A Fastify factory `buildIncomeApp` backed by SQLite.
- A typed HTTP client `IncomeClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
