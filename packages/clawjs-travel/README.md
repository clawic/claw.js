# @clawjs/travel

Countries and cities visited with notes

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Travel.
- A Fastify factory `buildTravelApp` backed by SQLite.
- A typed HTTP client `TravelClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
