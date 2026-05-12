# @clawjs/workouts

Workouts with parent sessions and child observations

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Workouts.
- A Fastify factory `buildWorkoutsApp` backed by SQLite.
- A typed HTTP client `WorkoutsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
