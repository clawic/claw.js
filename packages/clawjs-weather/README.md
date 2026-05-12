# @clawjs/weather

Weather conditions experienced

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Weather.
- A Fastify factory `buildWeatherApp` backed by SQLite.
- A typed HTTP client `WeatherClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
