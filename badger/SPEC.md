# clawjs-badger · publication framework spec

This spec is the canonical document. Code follows it; when code drifts, the spec wins until updated.

## Goal

A generic publication framework. The data model is the load-bearing thing. Adapters are pluggable and incremental. The framework is correct even if only one adapter is implemented.

## Runtime conventions

- Folder: `clawjs/badger/`. Same posture as `drive/`, `database/`, `vault/`, `memory/`.
- HTTP: Fastify 5.x + `@fastify/cors`, `@fastify/multipart`, `@fastify/static`, `@fastify/websocket`.
- DB: better-sqlite3, schema-as-code in `src/server/db/schema.ts`. Idempotent `CREATE TABLE IF NOT EXISTS` + an append-only migrations table for forward changes (`badger_migrations`).
- Validation: Zod schemas shared between server, CLI, and SDK via `src/shared/schemas.ts`.
- CLI: minimal custom argv parser at `src/bin/cli.ts`. Subcommand → action → HTTP client.
- Build: tsup to ESM, Node 20 target.
- Auth: opaque bearer token issued at install time, stored at `~/.config/clawjs-badger/token`.
- Secrets at rest: provider OAuth tokens go through `clawjs-vault`; Badger stores vault key references, never plaintext.
- Test framework: `tsx --test` for backend.
- Identifiers: ULIDs (sortable, opaque).
- Timestamps: stored as `INTEGER` epoch ms; SDK converts to ISO-8601 strings.

## Domain model (summary)

See the implementation in `src/server/db/schema.ts` for the exact column shapes. Entities:

- Tenancy: workspace, user, workspace_member, workspace_invitation, api_token, audit_event.
- Channels: channel_family (static registry), channel_account, channel_account_health.
- Content: post, post_account, post_variant, post_label, post_label_pivot, media, post_media_pivot, post_activity.
- Calendar: queue, queue_slot, queue_account, queue_entry, blackout_window, recurrence, bulk_import_batch.
- Campaigns: campaign, template, hashtag_group, dynamic_variable, evergreen_pool, evergreen_pool_member, ab_variant_set, ab_variant_member.
- Links: utm_template, tracked_link, link_shortener_provider.
- Locale: locale_variant_policy, audience_segment.
- Analytics: account_metric_daily, post_metric, report, report_export.
- Inbox: imported_post, inbox_thread, inbox_message, inbox_rule.
- Approvals: approval_workflow, post_approval, post_approval_decision, external_reviewer_link.
- Webhooks: webhook, webhook_delivery, integration_service, ai_brand_voice.
- Pipeline: job, job_batch.
- Settings: setting, system_status.

## Channel adapter contract

```ts
export const family: ChannelFamilyDescriptor;
export const adapter: ChannelAdapter;
```

A `ChannelAdapter` exports lifecycle hooks: `startOAuth`, `completeOAuth`, `refreshToken`, `revoke`, `probeHealth`, optional `listEntities`/`pickEntity`, `inspectCapabilities`, `validate`, `requiredConversions`, `publish`, optional `delete`, `fetchPost`, `fetchInsightsDaily`, `fetchAudienceDaily`, `fetchInboxSince`.

A `CapabilityDescriptor` declares: `contentKinds`, `text`, `media`, `thread`, `scheduling`, `options`, `rateLimit`, `multiVariant`, `audienceTargeting`, `firstComment`, `geo`, `deletion`, `attribution`.

The framework calls adapters through a fixed `ctx` object: logger, fetch with timeout + tracing, vault accessor, rate-limit registrar, idempotency-store accessor. Adapters never read the DB directly.

## Pipeline

```
scheduler cron (30s) → selects posts ready to fire
                     → dispatcher creates job_batch + one publish_post_account job per (post, channel_account)
worker drains jobs (state=queued AND available_at <= now)
       → guards: batch not cancelled / no provider_post_id (idempotency) / account authorized / rate-limit ok
       → adapter.validate() → adapter.publish()
       → on success: writes provider_post_id + provider_data
       → on rate-limit: re-enqueues with available_at = now + retry_after
       → on auth fail: marks account unauthorized
       → on transient: exponential backoff capped at 1h
batch finalizer: collapses per-account outcomes into post.publish_status
                 → published / partially_published / failed
                 → emits canonical events to webhook fan-out + WebSocket realtime
```

## Scheduling primitives

1. specific datetime (`scheduled_at`)
2. schedule now (`schedule_now: true`)
3. queue (next slot resolved against `queue_slot` × `queue_account` minus blackouts)
4. recurrence (RFC 5545 RRULE; `recurrence_tick` job materializes posts)
5. bulk import (CSV/JSON/RSS/external orchestrator; rows carry `idempotency_key`)
6. evergreen recycling (re-queue after cooldown, until cap)
7. A/B testing (winner picked by metric after evaluation window)
8. best-time-to-post suggester (`/v1/ws/:ws/suggest-time`)

## Lifecycle: two axes

- `editorial_status`: idea, drafting, in_review, ready, archived, published
- `publish_status`: unscheduled, scheduled, queued, publishing, partially_published, published, failed, cancelled, deleted

Pipeline refuses to fire if `editorial_status != ready`.

## Canonical webhook event names

`workspace.*`, `member.*`, `channel.*`, `post.*`, `variant.*`, `media.*`, `queue.*`, `recurrence.*`, `evergreen.*`, `ab.*`, `inbox.*`, `metric.*`, `audience.*`, `report.*`, `webhook.*`, `integration.*`, `job.failed_terminal`.

Signature header: `X-Badger-Signature: t=<unix>,v1=<hex>` over `t.body` with the per-webhook secret from vault.

## CLI surface

See `src/cli/commands/` and `badger --help`. Every API capability has a CLI command. JSON-out by default (`--json`); pretty-print when stdout is a TTY.

## Roadmap milestones

M0 scaffold, M1 tenancy, M2 domain CRUD, M3 pipeline, M4 adapter registry + family seeding, M5 Bluesky + Mastodon, M6 OAuth family (X, LinkedIn, Threads, Pinterest), M7 Meta (FB, IG), M8 vertical video (TikTok, YouTube), M9 long-form + forums, M10 chat, M11 feeds + email, M12 events + dev/docs, M13 inbox, M14 analytics rollups + reports, M15 AI integrations, M16 approvals + external reviewer links, M17 evergreen + A/B + recurrence polish, M18 SDK packages, M19 bridge integration.

v1.0 ships at M5 (one workspace, one user, two adapters, real end-to-end publishing).
