---
title: Audio Service
description: Local audio asset and transcript service for ClawJS apps.
---

# Audio Service

`audio/` is the standalone audio service for ClawJS apps that need app-scoped
voice message, dictation, and agent TTS asset storage.

The reusable implementation lives in `@clawjs/audio`:

- `AudioServiceStore` for SQLite metadata, transcript records, and blob files.
- `buildAudioApp()` for the Fastify HTTP service.
- `AudioApiClient` for service consumers.
- typed asset, transcript, registration, list, and byte payload contracts.

## Local Development

```bash
npm --prefix audio ci
npm --prefix audio run build
npm --prefix audio run start
```

By default the service listens on `127.0.0.1:24151`, stores data in
`audio/.data`, and uses `CLAW_AUDIO_SHARED_SECRET` for bearer-token auth.

## API Shape

The service keeps audio isolated by `appId`. App-scoped reads, byte downloads,
lists, and deletes require the same `appId` that registered the asset.

```ts
import { AudioApiClient } from "@clawjs/audio";

const audio = new AudioApiClient({
  baseUrl: "http://127.0.0.1:24151",
  token: process.env.CLAW_AUDIO_SHARED_SECRET ?? "",
});

const asset = await audio.register({
  kind: "user_message",
  appId: "my-app",
  originActor: "user",
  mimeType: "audio/mp4",
  bytesBase64,
  durationMs: 1200,
  transcript: { text: "hello", provider: "whisper" },
});

const bytes = await audio.getBytes(asset.asset.id, "my-app");
```

## CLI

The private service wrapper includes a small local CLI:

```bash
npm --prefix audio run cli -- serve --port 24151 --secret dev-secret
npm --prefix audio run cli -- list --url http://127.0.0.1:24151 --token dev-secret --app my-app
npm --prefix audio run cli -- get --url http://127.0.0.1:24151 --token dev-secret --app my-app --id <audio-id>
```

Use the package client for application code and the local CLI for service
inspection, development, and smoke checks.
