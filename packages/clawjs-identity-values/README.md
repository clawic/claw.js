# @clawjs/identity-values

Identity statements and values with periodic check-ins

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Identity & values.
- A Fastify factory `buildIdentityValuesApp` backed by SQLite.
- A typed HTTP client `IdentityValuesClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
