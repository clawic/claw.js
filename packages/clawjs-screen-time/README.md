# @clawjs/screen-time

Daily and per-app screen time

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Screen time.
- A Fastify factory `buildScreenTimeApp` backed by SQLite.
- A typed HTTP client `ScreenTimeClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
