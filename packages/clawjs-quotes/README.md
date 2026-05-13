# @clawjs/quotes

Quotes and citations from books, people, sources

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Quotes.
- A Fastify factory `buildQuotesApp` backed by SQLite.
- A typed HTTP client `QuotesClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
