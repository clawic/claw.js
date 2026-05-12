# @clawjs/music

Music listening with optional artist/album breakdown

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Music.
- A Fastify factory `buildMusicApp` backed by SQLite.
- A typed HTTP client `MusicClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
