---
title: IoT
description: Standalone home control plane for ClawJS with a canonical device model, semantic actions, approvals, and remote relay routes.
---

# IoT

`iot/` is a standalone local-first service in this repository. It gives agents and operators one normalized contract for:

- homes and areas
- things and capabilities
- connectors
- semantic actions
- scenes
- automations
- approvals
- event timelines

## Local workflow

```bash
npm --prefix iot ci
npm --prefix iot run build
npm --prefix iot run start
```

Default local URL:

- [http://127.0.0.1:4520](http://127.0.0.1:4520)

## CLI

```bash
iot homes list
iot things list --kind light
iot lights off office
iot climate set thermostat --temperature 21
iot scenes activate scene_good_night
iot approvals list
```

The main `claw` CLI exposes the same surface through `claw iot ...`.

## SDK

Configure `CreateClawOptions.iot.baseUrl`, then use:

- `claw.iot.inventory.*`
- `claw.iot.state.*`
- `claw.iot.actions.*`
- `claw.iot.scenes.*`
- `claw.iot.automations.*`
- `claw.iot.policies.*`
- `claw.iot.raw.invoke()`

## Relay

When Relay is configured with `RELAY_IOT_BASE_URL`, remote clients can call the home-scoped `/v1/tenants/:tenantId/homes/...` routes and stream IoT events over Relay.
