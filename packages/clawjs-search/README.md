# @clawjs/search

Framework-wide Search contracts and local federation primitives for ClawJS.

Search is the public capability. Index is an internal implementation detail for
documents, fragments, shards, cursors, and rebuildable sidecar state.

The package exposes `SearchEngineDescriptor` and `SEARCH_SQLITE_ENGINE` so hosts
can reason about the current rebuildable SQLite sidecar and future engines
without coupling UI section search paths to a physical store.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
