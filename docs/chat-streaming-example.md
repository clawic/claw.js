---
title: Chat Streaming Example
description: Example flow for sessions, context chips, structured stream events, retries, fallback, and title persistence.
---

# Chat Streaming Example

This example covers the closest thing to the end-user product surface:

- create a session
- append a user message with context chips
- stream assistant events
- force a gateway failure and recover through CLI fallback

Run [`../examples/chat-streaming-example.ts`](../examples/chat-streaming-example.ts) to demonstrate `transport`, `retry`, `chunk`, `done`, and title persistence in one place.

Key API surface:

- `claw.sessions.createSession()`
- `claw.sessions.appendMessage()`
- `claw.sessions.streamAssistantReplyEvents()`
