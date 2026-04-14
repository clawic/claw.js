---
title: Notify
description: Standalone Claw-first notification delivery service inspired by Pushover.
---

# Notify

`notify/` is a standalone Fastify service in this repository for Claw-first mobile notification delivery.

Use it when you need:

- app-scoped emitters with their own tokens
- user and device targeting across multiple mobile clients
- subscription-based delivery by `project`, `agent`, `workspace`, `eventType`, or severity
- critical alerts with receipts and acknowledgement
- syncable notification history and glance/state updates instead of relying on push transport as source-of-truth
- an operational inbox/admin UI in `apps/hub` backed by the same API

## What v1 includes

- source apps and token rotation
- separate client apps for iOS and Android
- device-installation registration with per-installation access tokens
- user preferences with `criticalOnly` and quiet-hours gating
- notification ingest with idempotency keys
- internal fanout to mock `apns` and `fcm` providers
- delivery history, read state, cancelation, and expiry
- critical receipts with acknowledgement
- subscription filters with `allow` and `mute`
- glance/state sync per user and client app
- admin list and control routes for dashboards and operations

## Local workflow

```bash
npm --prefix notify install
npm --prefix notify run build
npm --prefix notify run start
npm --prefix apps/hub run build
npm --prefix apps/hub run start
```

Default local credentials:

- email: `admin@notify.local`
- password: `notify-admin`

Default local URL:

- [http://127.0.0.1:4610](http://127.0.0.1:4610)
- Hub UI: [http://127.0.0.1:4360](http://127.0.0.1:4360)

## Core routes

- `POST /v1/auth/admin/login`
- `GET /v1/admin/source-apps`
- `GET /v1/admin/client-apps`
- `GET /v1/admin/notifications`
- `GET /v1/admin/deliveries`
- `GET /v1/admin/metrics/summary`
- `GET /v1/admin/users/:userId/feed`
- `GET /v1/admin/users/:userId/preferences`
- `PUT /v1/admin/users/:userId/preferences`
- `PUT /v1/admin/users/:userId/subscriptions`
- `DELETE /v1/admin/users/:userId/subscriptions/:id`
- `GET /v1/admin/users/:userId/devices`
- `GET /v1/admin/users/:userId/glances`
- `POST /v1/admin/installations/:id/unregister`
- `POST /v1/admin/deliveries/:deliveryId/read`
- `POST /v1/admin/receipts/:receiptId/ack`
- `POST /v1/source-apps`
- `POST /v1/source-apps/:id/rotate-token`
- `POST /v1/client-apps`
- `POST /v1/client/installations/register`
- `POST /v1/client/installations/:id/unregister`
- `POST /v1/client/installations/:id/push-token`
- `POST /v1/notifications`
- `POST /v1/notifications/:id/cancel`
- `GET /v1/receipts/:receiptId`
- `GET /v1/client/feed`
- `GET /v1/client/preferences`
- `PUT /v1/client/preferences`
- `GET /v1/client/devices`
- `GET /v1/client/glances`
- `POST /v1/client/notifications/:id/read`
- `POST /v1/client/receipts/:receiptId/ack`
- `PUT /v1/subscriptions`
- `DELETE /v1/subscriptions/:id`
- `PUT /v1/glances/:scope`

## Hub UI

`apps/hub` now acts as the full web surface for `notify`:

- user inbox with feed detail, read flow, and receipt acknowledgement
- preference editing for `criticalOnly` and quiet hours
- subscription management for followed or muted agents/events
- source-app and client-app administration
- delivery operations view plus a manual send panel
- glance/state cards for low-noise status surfaces

The Hub UI bootstraps local demo data against a real `notify` server so the product is runnable without manual seed scripts.

## SDK and CLI

The Node SDK exposes a `NotifyClient` under `@clawjs/claw`, and `createClaw()` can be configured with a `notify` block so `claw.notify.send()` and `claw.notify.subscriptions.*` call the same service.

The CLI exposes:

```bash
claw notify send --notify-url http://127.0.0.1:4610 --notify-source-token <token> --context-json '{"tenantId":"demo"}' --delivery-json '{"mode":"alert","title":"hello"}'
claw notify cancel <notification-id> --notify-url http://127.0.0.1:4610 --notify-source-token <token>
claw notify subscriptions upsert --notify-url http://127.0.0.1:4610 --notify-client-token <token> --source-app-id ops-center --agent-id deployer
claw notify subscriptions delete <subscription-id> --notify-url http://127.0.0.1:4610 --notify-client-token <token>
```

## Test coverage

The service ships with hermetic backend E2E coverage for:

- send -> audience resolution -> fanout -> feed sync
- multi-device delivery
- subscription allow/mute behavior
- critical receipts and acknowledgement
- idempotency and cancelation
- push-token rotation
- glance sync
- quiet-hours and user preference gating
- admin feeds, device listing, metrics, and unregister flows
- tenant isolation

`apps/hub` ships with its own Playwright E2E that boots the real `notify` backend locally and validates inbox, preferences, apps, operations, and final visual state from the web UI.
