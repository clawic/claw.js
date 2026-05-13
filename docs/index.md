---
title: Introduction
description: Overview of the ClawJS docs, runtime adapter model, and primary package surfaces.
---

<div class="intro-hero">
  <p class="intro-hero__eyebrow">Introduction</p>
  <h1>Build AI agent apps with any runtime.</h1>
  <p class="intro-hero__lead">ClawJS is the open-source Node.js SDK and CLI for building AI agent applications across multiple runtime adapters.</p>
  <div class="intro-hero__actions">
    <a href="/getting-started" class="VPButton medium brand">Getting Started</a>
    <a href="/api" class="VPButton medium alt">API Reference</a>
  </div>
</div>

ClawJS gives you one place to solve the hard parts that show up across runtimes without dropping the docs navigation context.

## Why ClawJS

ClawJS gives you one place to solve the hard parts that show up across runtimes:

- Runtime detection, install, repair, and compat tracking.
- Workspace initialization with adapter-specific file layouts.
- Auth, provider catalogs, and model catalogs.
- Normalized streaming and transport fallback.
- Intent, observed-state, and feature planning for adapter-owned settings.
- State snapshots for scheduler, memory, skills, channels, and speech config.
- A local-first productivity layer for tasks, notes, people, inbox, events, and search.
- File-backed media generation and asset storage for image, audio, and video workflows.

<div class="callout">
  <p><strong>Support note:</strong> Adapter maturity differs. Check the support matrix before picking a runtime for production use.</p>
</div>

## Architecture

| Package | Description |
| --- | --- |
| `@clawjs/core` | Shared types, schemas, capability maps, manifests, and snapshot shapes. |
| `@clawjs/claw` | Runtime adapters, workspace management, sessions, auth, compat, doctor, media generation, secrets, watchers, and state persistence. |
| `@clawjs/workspace` | Productivity extension for tasks, notes, people, inbox, events, search, context, and UI descriptors on top of the base SDK. |
| `@clawjs/database` | Shared database engine, API client, auth, realtime hub, store, and embeddable service app. |
| `@clawjs/audio` | Shared audio asset store, transcript catalog, API client, and embeddable service app. |
| `@clawjs/agents` | Filesystem-first agent identity, personality, skill collection, connection, and audit records. |
| `@clawjs/integrations` | Connection watchers and routing for inbound channel messages. |
| `@clawjs/sessions` | Shared session mirror store, FTS search, and native runtime import adapters. |
| `@clawjs/user-model` | Shared user profile store, snapshots, and embeddable profile service app. |
| `@clawjs/runtime` | Shared runtime loops for distillation, nudges, and profile refresh. |
| `@clawjs/node` | Compatibility wrapper that reexports the primary SDK surface for existing integrations that still import `@clawjs/node`. |
| `@clawjs/ssh-client` | Audited SSH client for mesh hosts with TOFU known-host handling, exec, SFTP, and bridge installation helpers. |
| `@clawjs/cli` | Official CLI with `claw` as the public binary for scaffolding, runtime management, workspace ops, productivity commands, sessions, media, and package-aware project generation. |
| `@clawjs/openclaw-plugin` | OpenClaw bridge plugin for gateway RPC methods, observability hooks, and managed tooling. |
| `@clawjs/openclaw-context-engine` | Experimental OpenClaw context engine package for runtime-side context selection. |
| `create-claw-*` packages | Compatibility wrappers around the same scaffolding engine used by `claw new`. |
| `eslint-config-claw` | Shared flat-config ESLint preset for ClawJS repositories. |

## Core Concepts

See [Terminology](/terminology) for the canonical naming used across ClawJS docs, code, and starter PRDs.

### Runtime adapters

A runtime adapter is the boundary between ClawJS and a concrete runtime. It owns probing, locations, workspace contracts, auth, models, sessions, doctor or compat, and optional subsystems.

### Workspaces and agents

A workspace is the isolated operational context. An agent is the identity operating inside that workspace. Some scaffolds use the same value for `workspaceId` and `agentId` as a convenience default, but those concepts stay separate.

### Capability maps

Every runtime status includes a typed `capabilityMap`. Capabilities are not implicit. They are marked as supported, degraded, or unsupported with a concrete strategy such as `cli`, `gateway`, `config`, `native`, or `bridge`.

### Stable `.claw/` layer

ClawJS writes new canonical workspace state under `.claw/` even when runtimes disagree on file names or directory structure. Legacy `.clawjs/` paths are compatibility-only until they are removed.

## Start Here

### First success

- [Getting Started](/getting-started) for the zero-config starter path and the production runtime path.
- [Setup and First Workspace](/setup) for manual integration into an existing repository.
- [Support Matrix](/support-matrix) before choosing an adapter for production work.

### Build apps

- [Workspace](/workspace) for the stable `.claw` layout and the `@clawjs/workspace` productivity layer.
- [Sessions](/sessions) for stored conversations, streaming, documents, title generation, and native runtime chat boundaries.
- [Local Agent Asset Library](/local-library) for reusable skills, instruction modules, and bundles assigned to local agents.
- [Agent Rules](/agent-rules/) for compact prompt-injected ClawJS operating instructions.
- [Files & Templates](/files) for template packs, bindings, and managed blocks.
- [Plugin Authoring](/plugins) for scaffolded distributable plugins and the OpenClaw bridge.

### Operate runtimes

- [Runtime](/runtime) for the adapter lifecycle, capability model, and transport policy.
- [Diagnostics & Repair](/diagnostics) for compat refresh and doctor flows.
- [Authentication](/authentication) for provider login and auth state.

### Use services

- [Database](/database) for local-first CRUD, the standalone service, scoped tokens, files, and realtime.
- [Audio Service](/audio) for app-scoped audio blobs, transcripts, and local service APIs.
- [Time Service](/time) for calendar, routines, deadlines, follow-ups, executions, and timeline views.
- [Content Service](/content), [Notify](/notify), [IoT](/iot), [Secrets](/secrets), [Drive](/drive), and [Execution](/execution) for standalone service surfaces.

### Integrate remotely

- [Relay](/relay) for the public HTTPS relay, reverse connector flow, and remote workspace routing model.
- [Interface Matrix](/interface-matrix) for the side-by-side SDK, CLI, and Relay API comparison.

### Reference

- [CLI](/cli) for the command surface.
- [API Reference](/api) for the instance namespaces and runtime-facing methods.
- [Public Surface](/surface) for the package export inventory.
- [Repository Map](/repository-map) for root folder ownership and layout rules.
- [Host Ownership](/host-ownership) for the ClawJS, `Claw.app`, and Clawix architecture boundary.
- [Terminology](/terminology) for canonical product vocabulary.
