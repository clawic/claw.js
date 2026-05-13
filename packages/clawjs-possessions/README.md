# @clawjs/possessions

Inventory of owned items

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Possessions.
- A Fastify factory `buildPossessionsApp` backed by SQLite.
- A typed HTTP client `PossessionsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
