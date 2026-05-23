# @clawjs/sessions

Multi-agent session mirror with FTS5 search, native-storage adapters, and HTTP service for ClawJS.

## Realistic fixtures

`seedRealisticSessionsFixture(store, { profile: "large" })` seeds synthetic
sessions into `sessions.sqlite` for performance, E2E, screenshots, and
regression work. The corpus includes long chats, attachment metadata, heavy
Markdown messages, provider-error turns, dense project lists, and recoverable
corruption markers. It contains fake data only and does not call providers or
require local attachment files.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
