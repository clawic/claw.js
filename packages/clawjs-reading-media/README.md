# @clawjs/reading-media

Books, articles, podcasts, movies, series

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Reading & media.
- A Fastify factory `buildReadingMediaApp` backed by SQLite.
- A typed HTTP client `ReadingMediaClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
