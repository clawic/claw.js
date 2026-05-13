# @clawjs/events-attended

Concerts, talks, conferences and shows attended

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Events attended.
- A Fastify factory `buildEventsAttendedApp` backed by SQLite.
- A typed HTTP client `EventsAttendedClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
