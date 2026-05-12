# @clawjs/health

General HealthKit-style metrics (HR, BP, glucose, etc.)

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Health.
- A Fastify factory `buildHealthApp` backed by SQLite.
- A typed HTTP client `HealthClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
