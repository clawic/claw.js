# @clawjs/personality-tests

Personality test results over time

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Personality tests.
- A Fastify factory `buildPersonalityTestsApp` backed by SQLite.
- A typed HTTP client `PersonalityTestsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
