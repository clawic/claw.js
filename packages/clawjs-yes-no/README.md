# @clawjs/yes-no

Yes/No commitments and their outcomes

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Yes/No log.
- A Fastify factory `buildYesNoApp` backed by SQLite.
- A typed HTTP client `YesNoClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
