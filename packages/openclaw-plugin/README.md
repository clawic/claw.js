# @clawjs/openclaw-plugin

Base OpenClaw bridge plugin for ClawJS.

It registers:

- `clawjs.*` gateway RPC methods
- structured observability hooks
- optional agent tools
- lightweight diagnostic commands

Install with OpenClaw:

```bash
openclaw plugins install @clawjs/openclaw-plugin
openclaw plugins enable clawjs
openclaw gateway restart
```

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
