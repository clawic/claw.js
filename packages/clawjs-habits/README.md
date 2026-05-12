# @clawjs/habits

Daily habits, streaks and targets

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Habits.
- A Fastify factory `buildHabitsApp` backed by SQLite.
- A typed HTTP client `HabitsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
