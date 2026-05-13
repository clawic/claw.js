# @clawjs/critiques

Critiques received from others

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Critiques received.
- A Fastify factory `buildCritiquesApp` backed by SQLite.
- A typed HTTP client `CritiquesClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
