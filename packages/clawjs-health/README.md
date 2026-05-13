# @clawjs/health

General HealthKit-style metrics (HR, BP, glucose, etc.)

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Health.
- A Fastify factory `buildHealthApp` backed by SQLite.
- A typed HTTP client `HealthClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
