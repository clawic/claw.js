# @clawjs/goals

Long-term aspirations and milestones (replaces iot.sqlite goals)

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Goals.
- A Fastify factory `buildGoalsApp` backed by SQLite.
- A typed HTTP client `GoalsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
