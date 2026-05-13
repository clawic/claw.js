# @clawjs/restaurants

Restaurants and cafes visited with rating

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Restaurants.
- A Fastify factory `buildRestaurantsApp` backed by SQLite.
- A typed HTTP client `RestaurantsClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
