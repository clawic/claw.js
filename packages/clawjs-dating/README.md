# @clawjs/dating

Dating history with people and outcomes

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Dating.
- A Fastify factory `buildDatingApp` backed by SQLite.
- A typed HTTP client `DatingClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
