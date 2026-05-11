# @clawjs/agents

Agent identity, composition and lifecycle for ClawJS. The package is filesystem-first: agents, personalities, skill collections and connections live under `~/.clawjs/` (override with `CLAWIX_CLAWJS_HOME`) and `AgentStoreFS` is a thin reader / writer on top.

```ts
import { AgentStoreFS, DEFAULT_CODEX_AGENT_ID, defaultAgent } from "@clawjs/agents";

const store = new AgentStoreFS();
const codex = store.readAgent(DEFAULT_CODEX_AGENT_ID)!;
const prompt = store.resolveSystemPrompt(codex);
```

The Swift mirror is `AgentStore.swift` in the Clawix macOS app; both sides use the same `SimpleYaml` grammar so records round-trip across runs.
