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
When an operation has a registered native runtime, the dry-run result also includes the request/source plan that would be used for execution. The plan is built from input values and auth binding names only; secret refs are reported separately and never resolved in dry-run mode.
Dry-runs also report invalid fields before execution, including invalid option values, numeric range violations, and basic type mismatches for common field types.

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

Runtime coverage can also write a provider-by-provider audit with final-state `implemented`, `missing`, `partial`, and `impossible` counts:

```bash
npm --workspace @clawjs/integrations run catalog:verify-runtime -- --catalog /tmp/clawjs-catalog.json --report /tmp/clawjs-runtime-audit.json
```

Runtime HTTP responses and `ConnectorRuntimeHttpError` instances expose normalized `rateLimit` metadata from common provider headers, including retry delay, remaining quota, reset timing, and policy text when present.
Runtime HTTP parsing treats `application/*+json` responses as JSON, so provider problem-detail and vendor media types stay structured in success and error paths.
Runtime implementations that cover multiple operations must attach offline fixtures to each `operationId`, so the audit cannot treat one generic fixture as proof for an entire provider.

Webhook sources can reuse `handleConnectorRuntimeWebhook` to extract events from an incoming payload with the same registered source plan used by dry-runs and audits. This keeps webhook validation offline-friendly: tests can pass fixture payloads directly, without opening a real HTTP endpoint or contacting the provider.

REST providers that publish OpenAPI 3 documents can use `buildOpenApiConnectorCatalog` and `createOpenApiConnectorRuntimeImplementation` to produce action catalogs and HTTP request plans from a supplied spec. The spec remains external input; the package does not vendor provider specifications.
OpenAPI conversion resolves local component references for path items, operations, parameters, request bodies, responses, schemas, and security schemes; remote `$ref` values are rejected so validation stays local and explicit.
OpenAPI content maps can use vendor or problem-detail media types ending in `+json`; those schemas are treated as JSON for fields and output validation, and generated plans preserve the selected request and response media types in headers.
OpenAPI schemas that compose fields with `allOf` are flattened before field and output-schema inference so request plans keep inherited properties and required paths.
OpenAPI `oneOf` and `anyOf` schemas are flattened conservatively: alternative properties become available fields while only required properties common to every alternative become required output paths.
OpenAPI response schemas derive nested required output paths for required object properties, so offline validation can catch missing nested objects without real provider calls.
OpenAPI server URLs may use server variables with defaults; the runtime resolves those defaults before constructing request plans.
OpenAPI path-level and operation-level `servers` override the document base URL per generated request plan, including server variable defaults.
OpenAPI request bodies declared as `application/x-www-form-urlencoded` are converted into form-encoded runtime request plans when no JSON body schema is present.
OpenAPI request bodies declared as `multipart/form-data` are converted into multipart runtime request plans when no JSON or URL-encoded body schema is present.
OpenAPI query parameters preserve supported serialization hints (`form`, `spaceDelimited`, `pipeDelimited`, and `deepObject`) so generated runtime plans can encode arrays and structured filters without provider-specific code.
OpenAPI parameters declared in `cookie` are converted into `Cookie` request headers alongside path, query, and header parameters.
When a spec declares standard bearer, basic auth, OAuth/OpenID bearer, or API key security schemes in headers, query params, or cookies, the OpenAPI runtime can derive secret fields and auth transport bindings automatically; explicit auth options still override the spec.
The OpenAPI runtime infers conservative offset, cursor, and next-URL pagination plans from common query parameters and response schemas, then replays them through the same offline fixture executor used by hand-written runtimes.
OpenAPI webhook definitions are exposed as webhook `source` operations and validate through operation-scoped `source_event` fixtures plus `handleConnectorRuntimeWebhook`.

Add `--execute-offline` to replay implemented runtimes against their local fixtures with intercepted fetch:

```bash
npm --workspace @clawjs/integrations run catalog:verify-runtime -- --catalog /tmp/clawjs-catalog.json --report /tmp/clawjs-runtime-audit.json --execute-offline
```
