# @clawjs/wildlife

Wildlife and nature encounters with photos

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Wildlife.
- A Fastify factory `buildWildlifeApp` backed by SQLite.
- A typed HTTP client `WildlifeClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
