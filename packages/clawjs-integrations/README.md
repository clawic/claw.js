# @clawjs/integrations

Connection manager and per-service watchers for ClawJS. The package owns the runtime side of the Telegram bot poller (and any other integration we add) and routes inbound messages to the agent whose `AgentIntegrationBinding` matches the `(connectionId, channelRef)` pair.

```ts
import { AgentStoreFS } from "@clawjs/agents";
import { IntegrationManager } from "@clawjs/integrations";

const store = new AgentStoreFS();
const manager = new IntegrationManager({
  store,
  async deliver({ agent, message }) {
    // hand the prompt to the agent's RuntimeAdapter, persist a chat row, etc.
  },
});
await manager.startAll();
```

Auth tokens never leave `~/.clawjs/connections/<id>/auth.encrypted`; the manager reads them through `AgentStoreFS.readConnectionAuth` so they stay encapsulated in one place.
