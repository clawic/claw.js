# @clawjs/donations

Donations and charitable giving

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Donations.
- A Fastify factory `buildDonationsApp` backed by SQLite.
- A typed HTTP client `DonationsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
