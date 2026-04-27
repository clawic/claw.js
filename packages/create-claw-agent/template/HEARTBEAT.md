# Heartbeat

Routine checks for __APP_TITLE__:

1. verify runtime status
2. inspect recent sessions
3. review memory and skill inventory
4. surface drift or missing setup

Operational rule:

If the workspace is not initialized, stop and instruct the operator to run `npm run claw:init`.

## Hermes maintenance recipes

Use these as routine templates when this workspace runs a Hermes-style agent. Custom checks must be explicitly allowed by the operator.

```bash
claw routines every "1h" "review Hermes reflections" --when custom:hermes.reflections:new --allow-custom-check hermes.reflections:new --prompt "Review recent reflections and distill stable lessons into compact memory." --target isolated --context diff --limit 20
claw routines every "6h" "promote Hermes patterns" --when custom:hermes.patterns:ready --allow-custom-check hermes.patterns:ready --prompt "Review repeated patterns and propose only useful rule or skill promotions." --target isolated --cooldown 1h --context diff --limit 20
claw routines every "1d" "trim Hermes memory" --when custom:hermes.memory:stale --allow-custom-check hermes.memory:stale --prompt "Keep memory short, current, and operational; remove stale detail." --target isolated --active-hours "09:00-18:00" --context diff --limit 20
```
