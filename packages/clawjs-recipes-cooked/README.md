# @clawjs/recipes-cooked

Recipes prepared with rating and variations

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Recipes cooked.
- A Fastify factory `buildRecipesCookedApp` backed by SQLite.
- A typed HTTP client `RecipesCookedClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
