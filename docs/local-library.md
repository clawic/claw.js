---
title: Local Agent Asset Library
description: Centralize reusable skills, instruction modules, and bundles for local ClawJS agents.
---

# Local Agent Asset Library

The local library is a personal, machine-local catalog for reusable agent assets. It sits above workspace skills and runtime files:

```text
library asset -> assignment -> resolved plan -> materialized workspace
```

Use it for reusable skills such as Namecheap, instruction modules such as a CEO operating style, tool policies, or bundles that combine several assets.

## Asset Types

The v1 asset kinds are:

- `skill`: a local path or install ref that can be synced into a workspace skill inventory.
- `instruction`: markdown projected into runtime files through managed blocks.
- `bundle`: an ordered set of asset ids expanded during resolution.

Assets store metadata, markdown content, and secret references only. They never store secret values.

Common fields:

- `id`
- `kind`
- `title`
- `description`
- `tags`
- `version`
- `source`
- `projection`
- `requiredSecrets`
- `autoApplyTags`

Skill assets can also declare a prompt capsule: a short instruction injected before a full skill is read.

```json
{
  "context": {
    "priority": 10,
    "capsule": "Track work in ClawJS tasks. Create/update tasks for actionable work; use notes for durable findings; search workspace before asking for known context.",
    "readWhen": ["planning work", "creating tasks", "saving learnings"]
  }
}
```

Capsules are limited to 300 characters. ClawJS sorts them by `priority`, then assignment order. Metadata stored on the library asset wins over skill metadata. Imported `skill.json` metadata wins over compatible `SKILL.md` frontmatter:

```yaml
---
clawjs-context:
  priority: 10
  capsule: Track actionable work in ClawJS tasks; use notes for durable findings.
  read-when: planning work, creating tasks
---
```

Telegram/Codex receives the resolved capsule block automatically and includes the default `clawjs-operator` capsule.

## CLI

```bash
claw library import-skill namecheap --id namecheap --path /path/to/namecheap-skill
claw library import-skill ops --path /path/to/ops --context-capsule "Track actionable work in ClawJS tasks." --context-priority 10
claw library create ceo-soul --kind instruction --projection agents --content "Operate like a pragmatic CEO."
claw library create developer-kit --kind bundle --assets namecheap,ceo-soul

claw library assign developer-kit --agent ada
claw library resolve --workspace /path/to/workspace --agent ada
claw library sync --workspace /path/to/workspace --agent ada
```

`claw new skill` and `claw generate skill` register generated skills in the local library by default. Pass `--no-library` to skip registration. Use `--library-dir` or `CLAW_LIBRARY_DIR` to isolate or move the library root.

## SDK

```ts
const claw = await createClaw({
  runtime: { adapter: "openclaw" },
  library: { rootDir: "/tmp/claw-library" },
  workspace: {
    appId: "ops",
    workspaceId: "ops-main",
    agentId: "ada",
    rootDir: "/tmp/ops-workspace",
  },
});

claw.library.importSkill("namecheap", {
  id: "namecheap",
  path: "/skills/namecheap",
  tags: ["domains"],
});

claw.library.createInstruction({
  id: "ceo-soul",
  title: "CEO Soul",
  projection: { target: "agents" },
  content: "Operate like a pragmatic CEO.",
});

claw.library.assign({ assetId: "namecheap", scope: "agent", targetId: "ada" });
const resolved = claw.library.resolve({ agentId: "ada" });
await claw.library.sync({ agentId: "ada" });
```

## Assignment Rules

Resolution is deterministic:

- Explicit includes for the target agent or workspace are included.
- Assets with `autoApplyTags` are included when all required tags are present in the resolve input.
- Bundles expand to their child assets.
- Explicit excludes win over includes and bundle expansion.

## Secret References

Use `requiredSecrets` to declare what an asset needs:

```bash
claw library create namecheap \
  --kind skill \
  --ref namecheap \
  --required-secret namecheap_api_token
```

`resolve` reports missing secret names. `sync` fails when required secrets are missing unless `--allow-missing-secrets` is passed. ClawJS only stores and prints references, not secret values.
