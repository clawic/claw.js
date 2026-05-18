# @clawjs/agents

Agent identity, composition and lifecycle for ClawJS. The package is filesystem-first: agents, personalities, skill collections and connections live under `~/.claw/` (override with `CLAW_HOME`) and `AgentStoreFS` is a thin reader / writer on top.

```ts
import { AgentStoreFS, DEFAULT_CODEX_AGENT_ID, defaultAgent } from "@clawjs/agents";

const store = new AgentStoreFS();
const codex = store.readAgent(DEFAULT_CODEX_AGENT_ID)!;
const prompt = store.resolveSystemPrompt(codex);
```

The Swift mirror is `AgentStore.swift` in the Clawix macOS app; both sides use the same `SimpleYaml` grammar so records round-trip across runs.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
