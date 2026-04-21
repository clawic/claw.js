---
title: Drive
description: Standalone local-first file, document, upload, revision, and sharing service.
---

# Drive

`drive/` is a local-first Google Drive-style product surface for ClawJS.

It ships as a standalone top-level service with:

- a Fastify backend
- a bundled web UI
- a typed local SDK client
- a CLI for operator and agent automation

## Current Scope

- nested folders
- native Docs, Sheets, and Slides stored as Drive JSON
- uploads plus previews for text, images, PDFs, audio, video, and office-like files
- recent, starred, shared, and trash views
- revision history with optimistic concurrency
- comments and share links
- scoped agent tokens

## Local Run

Install dependencies:

```bash
npm --prefix drive install
npm --prefix drive/ui install
```

Build and start:

```bash
npm --prefix drive run build
npm --prefix drive run start
```

Default local URL:

```text
http://127.0.0.1:4620
```

Default local admin credentials:

```text
email: admin@localhost
password: admin
```

These credentials and the default URL are disposable local-development
defaults. Do not use them against shared or production Drive services.

## CLI

Examples:

```bash
node drive/dist/cli.js auth login --url http://127.0.0.1:4620 --email admin@localhost --password admin
node drive/dist/cli.js doc create --token <token> --name "Launch brief"
node drive/dist/cli.js upload --token <token> --file ./notes.txt
node drive/dist/cli.js search --token <token> --query launch
```

## Conversion Mode

Automated tests run with `DRIVE_CONVERTER_MODE=mock` so browser and backend E2E stay hermetic.

In normal runtime the service can use host-side conversion and inspection tools when available, while keeping a safe fallback path when they are not.
