# @clawjs/node

Stable Node SDK entrypoint for Claw.

Use this package when an integration wants the Node-oriented SDK package name.

```bash
npm install @clawjs/node
```

The primary package exposes the same SDK surface:

```bash
npm install @clawjs/claw
```

```ts
import { Claw } from "@clawjs/claw";
```

`@clawjs/node` is a direct re-export of `@clawjs/claw`.
It does not add a separate runtime model, API layer, or release policy.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
