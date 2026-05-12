# @clawjs/pets

Pets and animal care events

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Pets.
- A Fastify factory `buildPetsApp` backed by SQLite.
- A typed HTTP client `PetsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
