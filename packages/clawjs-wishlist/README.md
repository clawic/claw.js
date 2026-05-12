# @clawjs/wishlist

Wishlist of items, places, skills, experiences

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Wishlist.
- A Fastify factory `buildWishlistApp` backed by SQLite.
- A typed HTTP client `WishlistClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
