# @clawjs/integrations

Connection controller and per-service watchers for ClawJS. The package owns the runtime side of the Telegram bot poller (and any other integration we add) and routes inbound messages to the agent whose `AgentIntegrationBinding` matches the `(connectionId, channelRef)` pair.

```ts
import { AgentStoreFS } from "@clawjs/agents";
import { IntegrationConnectionController } from "@clawjs/integrations";

const store = new AgentStoreFS();
const controller = new IntegrationConnectionController({
  store,
  async deliver({ agent, message }) {
    // hand the message to the agent's RuntimeAdapter, persist a session row, etc.
  },
});
await controller.startAll();
```

Connection credentials are not stored in this package. Connection records may
hold an opaque `secretRef`, and authenticated connector execution must ask the
Secrets broker to inject that reference into a declared action. Legacy
`auth.encrypted` files are ignored and removed by the agents store instead of
being decoded into plaintext.

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
    secretRefs: { bot: "secrets://connections/chat/bot" },
  },
});
```

`runConnectorOperation` and `runConnectorSource` default to dry-run mode. Real execution requires `dryRun: false`, connector control-plane approval, resolved secret refs, and either a registered runtime executor or an explicit executor override, so tests and UI previews cannot accidentally connect to a third-party API.
When an operation has a registered native runtime, the dry-run result also includes the request/source plan that would be used for execution. The plan is built from input values and auth binding names only; secret refs are reported separately and never resolved in dry-run mode.
Dry-runs also report invalid fields before execution, including invalid option values, numeric range violations, and basic type mismatches for common field types.

External command-line tools must be declared as command adapters before use.
`buildConnectorCommandAdapterPlan` exposes the command, arguments, provider,
capabilities, risk, support, and evidence without executing a process.
`assertConnectorCommandAdapterControlPlane` applies the same policy, grant,
credential-binding, budget, network, and audit checks used by API and SDK
runtimes before any host-owned process runner may execute the adapter.

Telegram ships the first native executor for this surface:

```ts
import { runConnectorOperation } from "@clawjs/integrations";

await runConnectorOperation({
  catalog,
  operationId: "telegram_bot_api.action.send-text-message-or-reply-send-text-message-or-reply",
  dryRun: true,
  input: {
    values: { chatId: "123", text: "hello" },
    secretRefs: { telegramBotApi: "secrets://connections/telegram/bot" },
  },
});
```

Authenticated connector execution must run through a capability broker. The
runner validates required secret references in dry runs but does not resolve
plaintext secret values. Registered source executors follow the same rule and
can be validated offline only for operations that do not require auth fields:

```ts
import { runConnectorSource } from "@clawjs/integrations";

await runConnectorSource({
  catalog,
  operationId: "telegram_bot_api.source.new-bot-command-received-new-bot-command-received",
  dryRun: true,
  input: {
    values: { commands: "[\"/start\"]" },
  },
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

The started-provider runtime baseline is checked offline with:

```bash
npm --workspace @clawjs/integrations run providers:verify-runtime
```

Runtime HTTP responses and `ConnectorRuntimeHttpError` instances expose normalized `rateLimit` metadata from common provider headers, including retry delay, remaining quota, reset timing, and policy text when present.
Runtime HTTP parsing treats `application/*+json` responses as JSON, so provider problem-detail and vendor media types stay structured in success and error paths.
Runtime implementations that cover multiple operations must attach offline fixtures to each `operationId`, so the audit cannot treat one generic fixture as proof for an entire provider.
Slack channel operations are registered as offline-validable Web API request plans for sending messages, listing conversations, and reading conversation info.
WhatsApp Business API operations are registered as offline-validable request plans for verifying a phone number id and sending text messages.
WhatsApp webhook sources are registered for inbound message and message-status payloads, including nested event extraction from Cloud API webhook envelopes.

Webhook sources can reuse `handleConnectorRuntimeWebhook` to extract events from an incoming payload with the same registered source plan used by dry-runs and audits. This keeps webhook validation offline-friendly: tests can pass fixture payloads directly, without opening a real HTTP endpoint or contacting the provider.

REST providers that publish OpenAPI 3 documents can use `buildOpenApiConnectorCatalog` and `createOpenApiConnectorRuntimeImplementation` to produce action catalogs and HTTP request plans from a supplied spec. The spec remains external input; the package does not vendor provider specifications.
OpenAPI conversion resolves local component references for path items, operations, parameters, request bodies, responses, schemas, and security schemes; remote `$ref` values are rejected so validation stays local and explicit.
OpenAPI content maps can use vendor or problem-detail media types ending in `+json`; those schemas are treated as JSON for fields and output validation, and generated plans preserve the selected request and response media types in headers.
OpenAPI request bodies whose schema cannot be decomposed into object properties are exposed as a single `body` field and serialized as the whole JSON payload.
OpenAPI schemas using nullable unions such as `["string", "null"]` keep their non-null field and output types while preserving required-path validation separately.
OpenAPI request fields skip `readOnly` properties, and output validation ignores `writeOnly` properties that providers should not return.
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
When a spec declares alternative OpenAPI security requirements, the runtime chooses one supported requirement instead of merging mutually exclusive auth schemes into one plan.
The OpenAPI runtime infers conservative offset, cursor, and next-URL pagination plans from common query parameters and response schemas, then replays them through the same offline fixture executor used by hand-written runtimes.
OpenAPI webhook definitions are exposed as webhook `source` operations and validate through operation-scoped `source_event` fixtures plus `handleConnectorRuntimeWebhook`.

Add `--execute-offline` to replay implemented runtimes against their local fixtures with intercepted fetch:

```bash
npm --workspace @clawjs/integrations run catalog:verify-runtime -- --catalog /tmp/clawjs-catalog.json --report /tmp/clawjs-runtime-audit.json --execute-offline
```

For OpenAPI-backed providers, build and verify a runtime catalog directly from a local JSON or YAML spec file:

```bash
npm --workspace @clawjs/integrations run openapi:verify-runtime -- --spec /tmp/provider-openapi.yaml --app-id provider --evidence packages/clawjs-integrations/src/openapi-runtime.test.ts --fixtures /tmp/provider-fixtures.yaml --report /tmp/provider-runtime-audit.json --execute-offline
```

Or generate a deterministic offline harness before replaying intercepted fetch:

```bash
npm --workspace @clawjs/integrations run openapi:verify-runtime -- --spec /tmp/provider-openapi.yaml --app-id provider --evidence packages/clawjs-integrations/src/openapi-runtime.test.ts --generate-fixtures /tmp/provider-runtime-fixtures --report /tmp/provider-runtime-audit.json --execute-offline
```

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
