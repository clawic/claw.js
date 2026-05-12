# @clawjs/finance

Transactions, budgets, savings, accounts, net worth

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Finance.
- A Fastify factory `buildFinanceApp` backed by SQLite.
- A typed HTTP client `FinanceClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
