# @clawjs/search

Framework-wide Search contracts and local federation primitives for ClawJS.

Search is the public capability. Index is an internal implementation detail for
documents, fragments, shards, cursors, and rebuildable sidecar state.

The package exposes `SearchEngineDescriptor` and `SEARCH_SQLITE_ENGINE` so hosts
can reason about the current rebuildable SQLite sidecar and future engines
without coupling UI section search paths to a physical store.
