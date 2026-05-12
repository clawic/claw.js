# @clawjs/goals

Long-term aspirations and milestones (replaces iot.sqlite goals)

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Goals.
- A Fastify factory `buildGoalsApp` backed by SQLite.
- A typed HTTP client `GoalsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
