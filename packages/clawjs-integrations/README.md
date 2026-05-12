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

## Connector catalogs

The package also exposes a generic catalog surface for app operations. Catalogs are plain JSON, can be extracted from an external component checkout, and can be searched or dry-run without contacting providers.

```ts
import {
  loadConnectorCatalogFromFile,
  runConnectorOperation,
  searchConnectorCatalog,
} from "@clawjs/integrations";

const catalog = loadConnectorCatalogFromFile("./catalog.json");
const matches = searchConnectorCatalog(catalog, { query: "send message", kind: "action" });

const preview = await runConnectorOperation({
  catalog,
  operationId: matches[0].operation.id,
  input: {
    values: { text: "hello" },
    secretRefs: { bot: "vault://connections/chat/bot" },
  },
});
```

`runConnectorOperation` and `runConnectorSource` default to dry-run mode. Real execution requires `dryRun: false`, resolved secret refs, and either a registered runtime executor or an explicit executor override, so tests and UI previews cannot accidentally connect to a third-party API.

Telegram ships the first native executor for this surface:

```ts
import { runConnectorOperation } from "@clawjs/integrations";

await runConnectorOperation({
  catalog,
  operationId: "telegram_bot_api.action.send-text-message-or-reply-send-text-message-or-reply",
  dryRun: false,
  input: {
    values: { chatId: "123", text: "hello" },
    secretRefs: { telegramBotApi: "vault://connections/telegram/bot" },
  },
  resolveSecret: async (ref) => secretStore.resolve(ref),
});
```

Registered source executors follow the same rule and can be validated offline with an injected fetch implementation:

```ts
import { runConnectorSource } from "@clawjs/integrations";

await runConnectorSource({
  catalog,
  operationId: "telegram_bot_api.source.new-bot-command-received-new-bot-command-received",
  dryRun: false,
  input: {
    values: { commands: "[\"/start\"]" },
    secretRefs: { telegramBotApi: "vault://connections/telegram/bot" },
  },
  resolveSecret: async (ref) => secretStore.resolve(ref),
  runtimeExecutorOptions: {
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 }),
  },
});
```

To build a catalog from a local component checkout:

```bash
npm --workspace @clawjs/integrations run catalog:extract -- --source /path/to/checkout --out /tmp/clawjs-catalog.json
```

To verify that the generated catalog still covers every local component file:

```bash
npm --workspace @clawjs/integrations run catalog:verify -- --source /path/to/checkout --catalog /tmp/clawjs-catalog.json
```
