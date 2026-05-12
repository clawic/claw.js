# @clawjs/photography

Shots, locations and photo of the day

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Photography.
- A Fastify factory `buildPhotographyApp` backed by SQLite.
- A typed HTTP client `PhotographyClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
