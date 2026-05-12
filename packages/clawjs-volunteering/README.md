# @clawjs/volunteering

Volunteering hours and service tasks

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Volunteering.
- A Fastify factory `buildVolunteeringApp` backed by SQLite.
- A typed HTTP client `VolunteeringClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
