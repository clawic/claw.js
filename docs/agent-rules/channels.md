---
title: Channels
description: Compact channel rules for Telegram and agent processors.
---

# Channels
<!-- migrated-to: catalog:agent-rules.channels.channels.write -->

Use channels for external message ingestion and reply routing.

- Register accounts and processors with `claw channels ...`.
- Use `claw channels listen start` for polling/listener flows.
- Use `claw channels telegram codex setup|start|status|logs|stop` for the Telegram/Codex bridge.
- Keep Telegram replies concise and preserve channel session context.
- Use bridge action blocks for outbound media instead of free-form URLs when the transport needs structured actions.
- Respect owner authorization, topic authorization, reply policy, queue, stop, compact, and status commands.
