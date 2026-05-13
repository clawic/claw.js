# @clawjs/cognition

Cognitive performance tests over time

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Cognition.
- A Fastify factory `buildCognitionApp` backed by SQLite.
- A typed HTTP client `CognitionClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
