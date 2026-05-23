# @clawjs/sessions

Multi-agent session mirror with FTS5 search, native-storage adapters, and HTTP service for ClawJS.

## Realistic fixtures

`seedRealisticSessionsFixture(store, { profile: "large" })` in
`packages/clawjs-sessions/src/realistic-fixtures.ts` seeds synthetic
sessions into `sessions.sqlite` for performance, E2E, screenshots, and
regression work. The corpus includes long chats, attachment metadata, heavy
Markdown messages, tool events, provider-error turns, dense project lists, and
recoverable corruption markers. It contains fake data only and does not call
providers or require local attachment files.

Profiles are deterministic and reproducible:

| Profile | Default size | Intended lane |
| --- | ---: | --- |
| `smoke` | 12 sessions | unit, CLI, and E2E smoke tests |
| `large` | 2,000 sessions | regular performance and regression runs |
| `heavy` | 5,000 sessions | explicit opt-in stress runs |

The service CLI can materialize the same corpus:

```bash
sessions seed-realistic --db-path /tmp/sessions.sqlite --profile smoke
```

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
