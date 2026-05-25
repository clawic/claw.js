# @clawjs/workspace

Local-first workspace productivity companion for ClawJS.

```bash
npm install @clawjs/workspace
```

```ts
import { createWorkspaceClaw } from "@clawjs/workspace";

const claw = await createWorkspaceClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "ops-main",
    agentId: "ops-main",
    rootDir: "./workspace",
  },
});

await claw.tasks.create({ title: "Triage docs drift" });
await claw.notes.create({ title: "Release notes", content: "Draft" });
const results = await claw.search.query({ query: "release" });
```

It extends a Claw instance with:

- `tasks`
- `notes`
- `people`
- `inbox`
- `events`
- `search`
- `context`
- `ui`

It stores productivity records in the canonical Claw main database at
`~/.claw/data/core.sqlite`; workspace control-plane files stay under `.claw/`.
It can add hybrid search with optional semantic embeddings.

See the root docs workspace guide for the stable `.claw/` layout and
the CLI productivity commands.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
