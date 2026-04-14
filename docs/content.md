---
title: Content Service
description: Standalone CMS and social publishing control plane for authoring, approvals, scheduling, and publication.
---

# Content Service

`content/` is the standalone content control plane for ClawJS.

It is the source of truth for:

- canonical content entries
- destination-specific variants
- approval workflows
- scheduling and publication plans
- publication runs and retries
- frontend contracts for the future SPA

## What v1 includes

- brands and campaigns
- publishing destinations with capability maps and policies
- canonical entries plus immutable revisions
- Drive-backed asset references
- variant generation and validation
- approval requests
- scheduling with optional Time integration
- publication runs with fake-safe adapters for hermetic validation
- a reserved frontend mount with static contracts and fixtures

## Local workflow

```bash
npm --prefix content ci
npm --prefix content run build
npm --prefix content run start
```

Default local credentials:

- email: `admin@content.local`
- password: `content-admin`

Default local URL:

- [http://127.0.0.1:4650](http://127.0.0.1:4650)

## CLI

The app ships its own CLI:

```bash
npm --prefix content run cli -- login --url http://127.0.0.1:4650 --email admin@content.local --password content-admin
```

The main `claw` CLI also exposes the same surface through a thin bridge:

```bash
claw content brand list --url http://127.0.0.1:4650 --token <admin-token>
```
