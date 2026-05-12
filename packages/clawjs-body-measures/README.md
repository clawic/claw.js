# @clawjs/body-measures

Weight, body fat, circumferences and progress photos

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Body measurements.
- A Fastify factory `buildBodyMeasuresApp` backed by SQLite.
- A typed HTTP client `BodyMeasuresClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
