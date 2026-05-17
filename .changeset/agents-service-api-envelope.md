---
"@clawjs/core": patch
"@clawjs/node": patch
---

Add a fail-closed Agents V1 service API envelope that returns the safe `service_api` projection, blocks on projection gaps, and exposes the helper through `createClaw().agents.serviceApi()`.
