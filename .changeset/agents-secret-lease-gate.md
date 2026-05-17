---
"@clawjs/core": patch
---

Deny direct Agents V1 secret and vault access through the effective access gate unless the request uses the brokered `lease_secret` action.
