# @clawjs/music

Music listening with optional artist/album breakdown

This package is part of the ClawJS signals modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Music.
- A Fastify factory `buildMusicApp` backed by SQLite.
- A typed HTTP client `MusicClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/signals`; this
package is intentionally thin so all 80 verticals share the same shape.
