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
