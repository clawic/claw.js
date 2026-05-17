---
"@clawjs/core": patch
"@clawjs/claw": patch
"@clawjs/node": patch
---

Add an Agents V1 autonomy policy gate that enforces `respond_only`, `suggest`, `act_limited`, and `act_full` profiles against proposed action severity and required approval, connector, budget, and host gates.
