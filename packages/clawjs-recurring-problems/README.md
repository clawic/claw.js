# @clawjs/recurring-problems

Recurring pain points and patterns

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Recurring problems.
- A Fastify factory `buildRecurringProblemsApp` backed by SQLite.
- A typed HTTP client `RecurringProblemsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
