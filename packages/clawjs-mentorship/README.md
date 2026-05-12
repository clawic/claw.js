# @clawjs/mentorship

Mentorship and teaching sessions with mentees

This package is part of the ClawJS tracking-modules family. It ships:

- A system-managed catalog (`src/catalog.json`) with curated variables for Mentorship.
- A Fastify factory `buildMentorshipApp` backed by SQLite.
- A typed HTTP client `MentorshipClient` for consumers.

The runtime, schema, and HTTP routes live in `@clawjs/tracking-runtime`; this
package is intentionally thin so all 80 verticals share the same shape.
