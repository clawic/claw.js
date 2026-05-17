---
"@clawjs/cli": patch
---

Stop publishing the CLI with a dependency on the retired `@clawjs/index` package. The technical `claw open index` compatibility launcher now resolves only local monorepo fallbacks while public Search entrypoints stay under `claw search` and `@clawjs/search`.
