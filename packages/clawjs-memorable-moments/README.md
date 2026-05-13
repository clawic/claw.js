# @clawjs/memorable-moments

Felt highlights with intensity, context and people

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Memorable moments.
- A Fastify factory `buildMemorableMomentsApp` backed by SQLite.
- A typed HTTP client `MemorableMomentsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
