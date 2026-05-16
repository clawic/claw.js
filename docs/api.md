---
title: API Reference
description: Runtime-facing instance namespaces, options, and public methods in @clawjs/claw.
---

# API Reference

This page documents the runtime-facing `@clawjs/claw` surface you use in
application code. The exhaustive export inventory for `@clawjs/claw`,
`@clawjs/core`, and `@clawjs/database` lives in [Public Surface](/surface).
For the side-by-side SDK, CLI, and Relay comparison, use
[Interface Matrix](/interface-matrix).

## Factories

```ts
import { Claw, createClaw } from "@clawjs/claw";

const claw = await Claw({
  runtime: {
    adapter: "openclaw",
  },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
});

const same = await createClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
});
```
## CreateClawOptions

| Path | Description |
|----|----|
| `runtime.adapter` | Required runtime adapter id such as `openclaw`, `codex`, `demo`, `hermes`, or `ironclaw`. |
| `runtime.binaryPath` | Optional executable override for runtimes such as OpenClaw or Codex when the binary is outside `PATH`. |
| `runtime.agentDir` | Optional runtime agent directory override. |
| `runtime.homeDir`, `configPath`, `workspacePath`, `authStorePath` | Optional adapter-specific path overrides. |
| `runtime.gateway` | Optional gateway `url`, `token`, `port`, and `configPath` overrides. |
| `runtime.pluginBridge` | Optional OpenClaw plugin bridge package and install settings. |
| `runtime.env` | Optional environment override passed to adapter commands. |
| `workspace.appId` | Stable application id persisted in the manifest. |
| `workspace.workspaceId` | Stable workspace id. |
| `workspace.agentId` | Stable agent id for runtime-specific state. |
| `workspace.rootDir` | Workspace root on disk. |
| `templates.pack` | Optional template-pack path applied during workspace initialization. |
| `secrets.backend` | Optional secrets backend. Defaults to `secrets` when `CLAW_SECRETS_BASE_URL`, `CLAW_SECRETS_TOKEN`, and `CLAW_SECRETS_TENANT_ID` are configured, otherwise `local_proxy`. |
| `secrets.baseUrl`, `secrets.credential`, `secrets.tenantId` | Secrets connection used by `claw.secrets`, typed actions, and brokered HTTP execution. |
| `secrets.sidecarPath` | Optional Secrets sidecar path used for proxy-compatible `{{secretName}}` flows and lease-backed process/browser injection. |
| `notify.baseUrl`, `sourceToken`, `clientToken` | Optional Notify service endpoint and source/client credentials for `claw.notify`. |
| `time.baseUrl`, `time.token` | Optional standalone time-service endpoint used for calendar, routines, reminders, deadlines, and follow-ups. |
| `time.dbPath`, `defaultTimeZone`, `schedulerIntervalMs`, `notifyBaseUrl`, `notifySourceToken` | Optional embedded temporal engine and notification integration settings when no time-service URL is configured. |
| `content.baseUrl`, `content.token` | Optional Content service endpoint and token for `claw.content`. |
| `iot.baseUrl`, `iot.token`, `iot.homeId` | Optional IoT service endpoint, token, and default home id for `claw.iot`. |

## Instance Namespaces

| Namespace | Methods |
|----|----|
| `claw.runtime` | `context`, `status`, `gateway.*`, install/uninstall/repair/setup methods, command builders, plan builders, OpenClaw context helpers |
| `claw.workspace` | `init`, `attach`, `validate`, `repair`, `previewReset`, `reset`, `listManagedFiles`, `canonicalPaths`, `inspect` |
| `claw.intent` | `get`, `set`, `patch`, `plan`, `apply`, `diff` |
| `claw.observed` | `read`, `refresh` |
| `claw.features` | `describe` |
| `claw.files` | template packs, binding sync, settings schema/value storage, workspace file read/write/preview/inspect, managed block helpers |
| `claw.compat` | `refresh`, `read` |
| `claw.doctor` | `run` |
| `claw.models` | `list`, `catalog`, `getDefault`, `setDefault` |
| `claw.providers` | `list`, `catalog`, `authState` |
| `claw.auth` | `status`, `diagnostics`, `prepareLogin`, `login`, `setApiKey`, `saveApiKey`, `setProviderEnabled`, `removeProvider` |
| `claw.scheduler` | `list`, `run`, `enable`, `disable` |
| `claw.memory` | `list`, `search` |
| `claw.skills` | `list`, `sync`, `sources`, `search`, `install` |
| `claw.library` | `list`, `get`, `create`, `update`, `remove`, `importSkill`, `createInstruction`, `createBundle`, `assign`, `unassign`, `resolve`, `sync` |
| `claw.generations` | backend registry plus generic generation create/list/read/delete |
| `claw.image`, `claw.audio`, `claw.video` | typed generation facades over the generic store |
| `claw.tts` | synthesize, config helpers, provider catalog, text segmentation, playback planning |
| `claw.channels` | `list`, account registry, target registry, agent bindings, message read/send/sync, command menus |
| `claw.telegram` | secret provisioning, bot connection, webhook and polling control, commands, chat inspection, moderation, invite links, update sync |
| `claw.slack` | bot connection, status, channel lookup, message send |
| `claw.whatsapp` | connection lifecycle, status, send, disconnect |
| `claw.inference` | `generateText` |
| `claw.secrets` | `list`, `describe`, `types`, `capabilities`, `actions`, `brokerHttp`, `runAction`, `leases`, `doctorKeychain`, `ensureHttpReference`, `ensureTelegramBotReference` |
| `claw.calendar` | calendar event CRUD, natural `at(...)`, and calendar views |
| `claw.routines` | routine CRUD, natural `every(...)`, `enable`, `disable`, `run`, and `history` |
| `claw.time` | legacy-compatible temporal item CRUD, pause/resume/run, execution history, calendar/timeline views, and anchor signals |
| `claw.iot` | inventory, state, actions, scenes, automations, approvals, and raw connector invocations |
| `claw.content` | brands, destinations, campaigns, entries, variants, approvals, calendar, publish plans/runs, app read models, and scoped tokens |
| `claw.notify` | notification send/cancel, receipts, feed sync, read/ack flows, push tokens, glances, and subscriptions |
| `claw.sessions` | session CRUD, title generation, structured reply streaming, chunk streaming |
| `claw.documents` | list, get, search, upload, register, chunked upload, download, ref resolution |
| `claw.storage` | local-first buckets/keys, raw object read/write/list/delete, scoped tokens, and read-only revocable shares |
| `claw.data` | `document`, `collection`, `asset`, `rootDir` |
| `claw.orchestration` | `snapshot` |
| `claw.watch` | conditional follow-up CRUD plus `file`, `transcript`, `runtimeStatus`, `providerStatus`, `events`, `eventsIterator` |

`claw.storage` is a local-first object layer for agent outputs and
handoffs. Raw writes are internal by default; images, generations, documents,
and writes marked with `visibility: "drive"` are the objects intended for the
Drive-facing search and share layer. Storage permissions are an SDK/API
ownership boundary, not a filesystem sandbox against code that can read the
workspace database and blob directory directly.

The public surface is intentionally tiered:

- `SDK core`: product primitives such as workspace setup, sessions, documents, providers, files, and inference.
- `SDK advanced public`: desired/observed state, watch APIs, orchestration, secrets, generations, speech, and adapter-adjacent helpers.
- `workspace extension public`: `@clawjs/workspace` namespaces layered on top of the base SDK.

Visibility markers used elsewhere in the docs:

- `stable`: normal product surface.
- `advanced`: public but more programmatic or specialized.
- `local-only`: valid in local SDK/CLI flows, not mirrored remotely.
- `remote-only`: Relay-only contract.
- `internal`: intentionally outside the public contract.

## Runtime

```ts
const status = await claw.runtime.status();
const context = claw.runtime.context();

await claw.runtime.install("npm");
await claw.runtime.setupWorkspace();

const gateway = await claw.runtime.gateway.status();
await claw.runtime.gateway.start();
await claw.runtime.gateway.waitUntilReady({ timeoutMs: 15_000 });
```
`claw.runtime` also exposes command builders and plan builders for
install, uninstall, repair, and workspace setup:

```text
claw.runtime.installCommand();
claw.runtime.uninstallCommand();
claw.runtime.repairCommand();
claw.runtime.setupWorkspaceCommand();

claw.runtime.installPlan();
claw.runtime.uninstallPlan();
claw.runtime.repairPlan();
claw.runtime.setupWorkspacePlan();
```
For OpenClaw-specific app-state management, the same namespace exposes
`discoverContext` and `detachWorkspace`.

When the adapter is `openclaw`, `claw.runtime.plugins` also exposes the
managed bridge workflow for the ClawJS plugin packages:

```ts
const pluginStatus = await claw.runtime.plugins.status();
await claw.runtime.plugins.ensure();
await claw.runtime.plugins.install("all");
await claw.runtime.plugins.enable("all");
const clawjsStatus = await claw.runtime.plugins.clawjs.status();
```

Use this namespace when you want to manage the OpenClaw bridge from app
code without shelling out yourself.

## Workspace

```ts
await claw.workspace.init();
const manifest = await claw.workspace.attach();
const validation = await claw.workspace.validate();
const repaired = await claw.workspace.repair();
const resetPlan = await claw.workspace.previewReset({ removeSessions: true });
const resetResult = await claw.workspace.reset({ removeSessions: true });
const inspection = await claw.workspace.inspect();
```
`inspect()` returns both resolved workspace file paths and the parsed
manifest, compat snapshot, observed snapshots, and the current
intent/observed stores currently persisted in the workspace.

## Time

Configure the standalone temporal service through `CreateClawOptions.time`
when you want one source of truth for calendar events, routines,
reminders, deadlines, and conditional watches:

```ts
const claw = await createClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
  time: {
    baseUrl: "http://127.0.0.1:4730",
  },
});

await claw.routines.every({
  title: "Review pull requests",
  expression: "3h",
  timezone: "Europe/Madrid",
});

await claw.calendar.at({
  title: "Release sync",
  expression: "monday 9am",
});

await claw.watch.create({
  target: "thread:thread-42",
  ifNo: "reply",
  after: "24h",
  then: { kind: "remind", title: "Ping owner" },
});

const calendar = await claw.calendar.view();
const executions = await claw.routines.history();
```

Use `claw.calendar`, `claw.routines`, `claw.reminders`, and `claw.watch`
for public integrations. The lower-level `claw.time` namespace remains
available for compatibility.

## Content

Configure the standalone content service through `CreateClawOptions.content`
when content entries, variants, approvals, publish plans, and content app
read models are the product source of truth:

```ts
const claw = await createClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
  content: {
    baseUrl: "http://127.0.0.1:4650",
    token: "<local-dev-token>",
  },
});

const brands = await claw.content.brands.list();
const entries = await claw.content.entries.list({ status: "draft" });
const approvals = await claw.content.approvals.list();
const dashboard = await claw.content.app.dashboard();
```

Use the content namespace for CMS and publishing workflows. Use
`claw.documents` for workspace-local document blobs and refs attached to
sessions.

## Notify

Configure the standalone Notify service through `CreateClawOptions.notify`
when notifications, receipts, glances, and subscriptions are product
objects:

```ts
const claw = await createClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
  notify: {
    baseUrl: "http://127.0.0.1:24103",
    sourceToken: "<local-source-token>",
    clientToken: "<local-client-token>",
  },
});

const sent = await claw.notify.send({
  context: { tenantId: "demo", eventType: "deploy.finished" },
  delivery: { mode: "alert", title: "Deploy finished" },
});

const feed = await claw.notify.feed(20);
await claw.notify.subscriptions.upsert({ agentId: "deployer", action: "allow" });
```

Use `sourceToken` for emitting notifications and source-owned glances.
Use `clientToken` for user-facing feed, read, acknowledgement, and
subscription flows.

## Intent, Observed, and Features

```ts
const allIntents = claw.intent.get();
const modelsIntent = claw.intent.get("models");
await claw.intent.patch("models", { defaultModel: "openai/gpt-5.4" });
await claw.intent.plan({ domains: ["models", "providers"] });
await claw.intent.apply({ domains: ["models", "providers"] });
const drift = await claw.intent.diff({ domains: ["models", "providers"] });

const observed = claw.observed.read();
await claw.observed.refresh({ domains: ["models", "providers", "channels"] });

const features = claw.features.describe();
```

The ownership model is the important bit:

- `intent` stores desired SDK-owned state under `.claw/state/desired/`
- `observed` stores rebuildable runtime-derived state under `.claw/state/observed/`
- `features.describe()` tells you which domains are adapter-owned, SDK-owned, or mixed before you call `apply()`

That keeps UI and automation code from guessing which side owns a given
setting.
## Files

The file surface is documented in depth in [Files & Templates](/files). The runtime-facing methods are:

```ts
await claw.files.applyTemplatePack("/path/to/pack.json");

claw.files.diffBinding(binding, settings, render);
claw.files.syncBinding(binding, settings, render);

claw.files.readBindingStore();
claw.files.writeBindingStore(bindings);
claw.files.readSettingsSchema();
claw.files.writeSettingsSchema(schema);
claw.files.readSettingsValues();
claw.files.writeSettingsValues(values);
claw.files.validateSettings(values);
claw.files.renderTemplate(template, values);
claw.files.updateSettings(values, { autoSync: true, renderers });

claw.files.readWorkspaceFile("SOUL.md");
claw.files.writeWorkspaceFile("SOUL.md", nextContent);
claw.files.writeWorkspaceFilePreservingManagedBlocks("SOUL.md", nextContent);
claw.files.previewWorkspaceFile("SOUL.md", nextContent);
claw.files.inspectWorkspaceFile("SOUL.md");
claw.files.inspectManagedBlock("SOUL.md", "tone");
claw.files.mergeManagedBlocks(original, edited);
```
## Models, Providers, and Auth

```ts
const providers = await claw.providers.list();
const providerCatalog = await claw.providers.catalog();
const authState = await claw.providers.authState();

const models = await claw.models.list();
const modelCatalog = await claw.models.catalog();
const defaultModel = await claw.models.getDefault();
await claw.models.setDefault("openai/gpt-4.1");

const summaries = await claw.auth.status();
const authDiagnostics = claw.auth.diagnostics("openai");
const loginPlan = await claw.auth.prepareLogin("openai");
const loginResult = await claw.auth.login("openai", { setDefault: true });
claw.auth.setApiKey("openai", "sk-...", "default");
await claw.auth.saveApiKey("openai", "sk-...");
await claw.auth.setProviderEnabled("openai-codex", true, { preferredAuthMode: "oauth" });
claw.auth.removeProvider("openai");
```
These auth operations also update the canonical provider intent under
`.claw/state/desired/providers.json`, while observed auth summaries stay
rebuildable under `.claw/state/observed/providers.json`.

`prepareLogin()` tells you whether ClawJS can reuse existing auth for the
requested provider or whether an interactive flow still needs to be
launched. `login()` returns the same distinction plus the launch mode when
an interactive flow starts.

For real secrets, prefer the `claw.secrets` helpers plus brokered
execution rather than hardcoding credentials in source. Secrets is now the
default backend whenever its `CLAW_SECRETS_*` connection settings are present.

## Speech / TTS

```ts
const ttsConfig = claw.tts.config();

claw.tts.setConfig({
  provider: "openai",
  enabled: true,
  autoRead: true,
  voice: "nova",
  model: "tts-1",
});

await claw.intent.apply({ domains: ["speech"] });
```

## IoT

Configure the standalone IoT service through `CreateClawOptions.iot` when you want SDK access to homes, things, scenes, approvals, and automations:

```ts
const claw = await Claw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
  iot: {
    baseUrl: "http://127.0.0.1:4520",
  },
});

const homes = await claw.iot.inventory.homes.list();
await claw.iot.actions.lights.off("office");
const approvals = await claw.iot.policies.listApprovals();
```
## Optional Runtime Subsystems

```ts
await claw.scheduler.list();
await claw.scheduler.run("daily-summary");
await claw.scheduler.enable("daily-summary");
await claw.scheduler.disable("daily-summary");

await claw.memory.list();
await claw.memory.search("incident");

await claw.skills.list();
await claw.skills.sync();

await claw.channels.list();
await claw.channels.accounts.registerTelegramBot({
  accountId: "support",
  secretName: "telegram_support_bot_token",
});
claw.channels.processors.register({
  id: "support-router",
  command: "node ./support-router.js",
});
claw.channels.bindings.grant({
  agentId: "support-router",
  provider: "telegram",
  accountId: "support",
  targetId: "-1001234567890",
  permissions: ["read", "write", "ingest"],
});
await claw.channels.listen.run({
  provider: "telegram",
  accountId: "support",
  processorId: "support-router",
});
await claw.channels.messages.sync({ provider: "telegram", accountId: "support" });
await claw.channels.messages.send({
  provider: "telegram",
  accountId: "support",
  targetId: "-1001234567890",
  text: "hello",
  agentId: "support-router",
});
```
Always check `status.capabilityMap` before assuming these subsystems are
supported by the current adapter.

## Local Agent Asset Library

```ts
claw.library.importSkill("namecheap", { id: "namecheap", path: "/skills/namecheap" });
claw.library.createInstruction({
  id: "ceo-soul",
  title: "CEO Soul",
  projection: { target: "agents" },
  content: "Operate like a pragmatic CEO.",
});
claw.library.assign({ assetId: "namecheap", scope: "agent", targetId: "ada" });
const resolved = claw.library.resolve({ agentId: "ada", tags: ["domains"] });
const capsules = claw.library.resolveSkillCapsules({ agentId: "ada" });
await claw.library.sync({ agentId: "ada", availableSecrets: ["namecheap_api_token"] });
```

The library is local-personal by default and can be isolated with
`library.rootDir`. It stores secret references and required metadata, not
secret values. Skill assets can include `context.capsule`, `context.priority`,
and `context.readWhen`; capsules are limited to 300 characters and resolve in
priority then assignment order.

## Generations And Typed Media Facades

The generic generation store is useful when you want one API for image,
audio, video, or document jobs, while the typed facades remove the need
to pass `kind` repeatedly.

```ts
const backends = claw.generations.backends();
await claw.generations.registerCommandBackend({
  id: "local-imagen",
  label: "Local Imagen",
  supportedKinds: ["image"],
  command: "node",
  args: ["scripts/generate-image.mjs"],
});

const generic = await claw.generations.create({
  kind: "image",
  prompt: "Minimal line-art cat",
});

const image = await claw.image.generate({
  prompt: "Minimal line-art cat",
});

const imported = claw.image.import({
  filePath: "/tmp/codex-logo.png",
  prompt: "Codex generated logo exploration",
  provenance: "imported-codex",
  imageType: "logo",
  tags: ["brand", "codex"],
});

const edit = await claw.image.edit({
  parentId: imported.id,
  prompt: "Make the logo monochrome",
});

const audio = await claw.audio.generate({
  prompt: "Read the summary aloud",
});
```

Image records are stored in the local image library so agents and
workspaces can browse generated, edited, and imported assets later with
`list()`, `search()`, `get()`, and `remove()`. Edits are immutable child
records with parent/source ids; imported Codex or ChatGPT images can carry
the same prompt, provider, tag, type, and provenance metadata as native
generations.

## Persistent Media Index

Documents, generated assets, imported images, voice notes, and channel media
are also written into the canonical media index. The index is for retrieval
and sharing; agents should keep using the normal send/upload/generation APIs.

```ts
const recent = claw.media.list({ agentId: "support-agent", kind: "document" });
const hits = claw.media.search({ query: "requirements", provider: "telegram" });
const file = claw.media.download(hits[0].mediaId);

const share = await claw.media.share.create({
  label: "Requirements PDFs",
  filters: { kind: "document", query: "requirements" },
});

await claw.media.share.revoke(share.id);
```

Media records include agent, session, channel, direction, storage/external
reference, and searchable text when it is available from document indexing or
voice transcription.

## Telegram and Secrets

```ts
await claw.telegram.provisionSecretReference({
  secretName: "my_bot_token",
  apiBaseUrl: "https://api.telegram.org",
});

await claw.telegram.connectBot({ secretName: "my_bot_token" });
await claw.telegram.status();
await claw.telegram.configureWebhook({ url: "https://example.com/telegram" });
await claw.telegram.disableWebhook();
await claw.telegram.startPolling({ timeoutSeconds: 30 });
await claw.telegram.stopPolling();
await claw.telegram.setCommands([{ command: "help", description: "Show help" }]);
await claw.telegram.getCommands();
await claw.telegram.listChats();
await claw.telegram.getChat(123);
await claw.telegram.getChatAdministrators(123);
await claw.telegram.getChatMember(123, 456);
await claw.telegram.setChatPermissions(123, { can_send_messages: false });
await claw.telegram.banOrRestrictMember({ action: "ban", chatId: 123, userId: 456 });
await claw.telegram.createInviteLink(123, { name: "Support" });
await claw.telegram.revokeInviteLink(123, "https://t.me/+...");
await claw.telegram.sendMessage({ chatId: 123, text: "hello" });
await claw.telegram.sendMedia({ type: "photo", chatId: 123, media: "https://..." });
await claw.telegram.syncUpdates();
await claw.telegram.ingestUpdate(updatePayload);

await claw.secrets.list("telegram");
await claw.secrets.describe("my_bot_token");
await claw.secrets.types("revenuecat");
await claw.secrets.capabilities("my_bot_token");
await claw.secrets.actions("my_bot_token");
await claw.secrets.brokerHttp({
  method: "POST",
  url: "https://slack.com/api/auth.test",
  capability: "broker.http",
  agent: "demo-agent",
  riskTier: "read",
  declaredFields: [{ secretName: "slack_bot_token", fieldName: "token", placement: "header" }],
  headers: {
    Authorization: "Bearer {{slack_bot_token.token}}",
  },
});
await claw.secrets.runAction("revenuecat_admin", "revenuecat.projects.list");
await claw.secrets.leases();
await claw.secrets.doctorKeychain();
await claw.secrets.ensureHttpReference({
  name: "service_token",
  allowedHosts: ["api.example.com"],
  allowedHeaderNames: ["Authorization"],
});
await claw.secrets.ensureTelegramBotReference({
  name: "my_bot_token",
  apiBaseUrl: "https://api.telegram.org",
});
```

Use explicit Secrets settings when you want the SDK to treat Secrets as the
canonical backend and still keep sidecar compatibility for
`{{secretName}}` references:

```ts
const claw = await createClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
  secrets: {
    backend: "secrets",
    baseUrl: "http://127.0.0.1:24103",
    credential: "<sidecar-principal-token>",
    tenantId: "demo-tenant",
    sidecarPath: "/absolute/path/to/secrets/dist/sidecar.js",
  },
});
```

`types()` returns the typed secret catalog, `capabilities()` returns the
effective allow/deny view for the current principal, `actions()` exposes
brokered typed actions for the selected secret type, and `brokerHttp()`
or `runAction()` keeps execution inside Secrets without exposing plaintext
credentials to the caller.

Slack and WhatsApp currently live on the same instance when the adapter
supports them:

```ts
await claw.slack.connectBot({ secretName: "slack_bot" });
await claw.slack.listChannels();

await claw.whatsapp.connect({
  mode: "business-api",
  secretName: "wa_token",
  phoneNumberId: "1234567890",
});
await claw.whatsapp.status();
```

The CLI does not expose these namespaces yet. Use the SDK when you need
them.

## OpenClaw Native Gateway

When the selected adapter is `openclaw`, the SDK also exposes a native
gateway namespace for runtime-specific session and chat operations:

```ts
await claw.runtime.openclaw.sessions.list({ limit: 10 });
await claw.runtime.openclaw.sessions.preview({ sessionKey: "alpha" });
await claw.runtime.openclaw.sessions.resolve({ sessionKey: "alpha" });
await claw.runtime.openclaw.chat.history({ sessionKey: "alpha" });
await claw.runtime.openclaw.chat.send({ sessionKey: "alpha", message: "hello" });
await claw.runtime.openclaw.chat.inject({ sessionKey: "alpha", message: "system note" });
await claw.runtime.openclaw.chat.abort({ sessionKey: "alpha" });
```

Use `claw.sessions` for product chat stored in the workspace. Use
`claw.runtime.openclaw` when you need native OpenClaw gateway semantics.

## Inference and Sessions

```ts
const result = await claw.inference.generateText({
  messages: [{ role: "user", content: "Summarize the repo." }],
  transport: "auto",
});

const session = claw.sessions.createSession("Repo tour");
claw.sessions.appendMessage(session.sessionId, {
  role: "user",
  content: "Explain the runtime layout.",
});

const loaded = claw.sessions.getSession(session.sessionId);
const sessions = claw.sessions.listSessions();
claw.sessions.updateSessionTitle(session.sessionId, "Runtime layout");
await claw.sessions.generateTitle({ sessionId: session.sessionId });

const document = await claw.documents.upload({
  name: "brief.txt",
  mimeType: "text/plain",
  data: Buffer.from("alpha notes").toString("base64"),
  sessionId: session.sessionId,
});

claw.sessions.appendMessage(session.sessionId, {
  role: "user",
  content: "Use the attached brief.",
  documents: [{
    documentId: document.documentId,
    name: document.name,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
  }],
});

const hits = await claw.documents.search({ query: "alpha", sessionId: session.sessionId });

for await (const event of claw.sessions.streamAssistantReplyEvents({
  sessionId: session.sessionId,
  transport: "auto",
})) {
  if (event.type === "chunk") process.stdout.write(event.chunk.delta);
}

for await (const chunk of claw.sessions.streamAssistantReply({
  sessionId: session.sessionId,
})) {
  if (!chunk.done) process.stdout.write(chunk.delta);
}
```

Session messages now normalize persisted file references into `message.documents`.
Legacy `attachments` are still accepted as input, but persisted transcripts and relay
responses expose document refs instead of embedding file payloads in the transcript.

On the `openclaw` adapter, session routing is capability-based:

- `streamAssistantReply*()` prefers `/v1/responses`
- text-only fallback can use `/v1/chat/completions`
- title generation keeps using the lighter text path when appropriate

On the `codex` adapter, session routing prefers the Codex app-server protocol and falls back to `codex exec --json`. Authentication remains owned by the Codex CLI: ClawJS checks `codex login status` and can launch `codex login`, but does not read or store Codex credentials.
## Data Store and Orchestration

```ts
const preferences = claw.data.document("preferences");
preferences.write({ locale: "en" });
const saved = preferences.read();

const tasks = claw.data.collection("tasks");
tasks.put("build", { state: "queued" });
const allTasks = tasks.entries();

const asset = claw.data.asset("artifacts/report.txt");
asset.writeText("ready");

const orchestration = await claw.orchestration.snapshot();
```
The workspace storage API is a simple file-backed storage layer for JSON
documents, keyed collections, and raw assets rooted under the current
workspace.

## Workspace Extension Namespaces

When you instantiate `@clawjs/workspace`, the extension adds:

- `workspace.tasks`
- `workspace.notes`
- `workspace.people`
- `workspace.inbox`
- `workspace.events`
- `workspace.search`
- `workspace.workspaceIndex`
- `workspace.context`
- `workspace.ui`

## Watchers

The watcher surface is documented in depth in [Watchers & Events](/watchers). The instance-level methods are:

```ts
const stopFile = claw.watch.file("SOUL.md", (event) => {});
const stopTranscript = claw.watch.transcript("session-id", (event) => {});
const stopRuntime = claw.watch.runtimeStatus((status) => {});
const stopProviders = claw.watch.providerStatus((providers) => {});
const stopEvents = claw.watch.events("workspace.initialized", (event) => {});

for await (const event of claw.watch.eventsIterator("*")) {
  console.log(event.type, event.payload);
  break;
}
```
## Contracts

The main runtime contracts come from `@clawjs/core`. The most important
ones are `RuntimeInfo`, `RuntimeCapabilityMap`, `ProviderDescriptor`,
`ModelDescriptor`, `AuthState`, `SchedulerDescriptor`,
`MemoryDescriptor`, `SkillDescriptor`, `ChannelDescriptor`, `Message`,
`SessionRecord`, `TemplatePack`, and `BindingDefinition`.
