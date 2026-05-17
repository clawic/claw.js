---
"@clawjs/search": minor
"@clawjs/cli": patch
"@clawjs/core": patch
---

Add the public Search package with framework-wide source manifests, federation contracts, result actions, budgets, and lexical scoring helpers.
Add the initial rebuildable `search.sqlite` store for source manifests, documents, fragments, FTS rows, actions, cursors, tombstones, saved searches, monitors, vector placeholders, and ranking cache.
Expose the first Search source/status/profile/action/explain CLI surface.
