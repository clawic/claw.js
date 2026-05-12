# @clawjs/compliments

Compliments received from others

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Compliments.
- A Fastify factory `buildComplimentsApp` backed by SQLite.
- A typed HTTP client `ComplimentsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
