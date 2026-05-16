---
title: Plugin Authoring
description: Build distributable Claw plugins with manifests, config, hooks, bundled skills, and OpenClaw bridge installation.
---

# Plugin Authoring

Use a plugin when you need a distributable integration package that
combines configuration, hooks, runtime support metadata, and bundled logic.
Use a skill when you only need one reusable task primitive.

## Scaffold

```bash
claw new plugin jira-integration
cd jira-integration
npm run plugin:check
```

`create-claw-plugin` remains available as a direct generator entrypoint, and
`claw new plugin` is the primary flow.

The generated package includes:

- `plugin.json` for id, name, version, compatibility, and packaged surfaces
- `src/config.ts` for config fields and validation
- `src/hooks.ts` for lifecycle hooks such as `beforeSessionStart` and `afterAssistantReply`
- `src/skills/` for bundled plugin skill logic
- `src/index.ts` for the plugin manifest and activation flow
- `examples/config.json` for a minimal local configuration
- `src/harness.ts` and `npm run plugin:check` for local verification

## Minimal Shape

```ts
import { pluginManifest, activatePlugin } from "./src/index.js";

const plugin = await activatePlugin({
  provider: "jira",
  projectKey: "OPS",
  baseUrl: "https://jira.example.com",
  enableAutoTriage: true,
  defaultLabels: ["support"],
});

console.log(plugin.manifest.id);
await plugin.hooks.beforeSessionStart({ sessionId: "session-1" });
await plugin.skills.triage({ title: "Login issue", body: "Customer cannot sign in." });
```

Config validation should reject incomplete or unsafe settings before any
hook or bundled skill runs. For external services, prefer secret
references and brokered calls over plaintext credentials.

## Manifest and Lifecycle

- Keep `plugin.json` aligned with the exported `pluginManifest`.
- Put runtime support and packaged-surface metadata in the manifest, not
  in prose-only README notes.
- Use `activatePlugin(rawConfig)` as the single entrypoint that validates
  config and returns hooks, skills, and metadata.
- Keep hooks deterministic and side-effect-light unless the plugin config
  explicitly enables external actions.
- Keep `plugin:check` as the local gate before publishing or installing a
  generated plugin package.

## OpenClaw Bridge

`@clawjs/openclaw-plugin` is the base OpenClaw bridge plugin for ClawJS.
When the selected adapter is `openclaw`, the SDK exposes a managed bridge
workflow:

```ts
const status = await claw.runtime.plugins.status();
await claw.runtime.plugins.ensure();
await claw.runtime.plugins.install("all");
await claw.runtime.plugins.enable("all");
```

Use the bridge for runtime-side gateway RPC methods, observability hooks,
and managed tooling. Use distributable plugin packages for app-level or
integration-specific behavior that should be versioned and checked on its
own.
