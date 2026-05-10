#!/usr/bin/env node
/* eslint-disable no-console */
import readline from "node:readline";

const env = process.env;
const failOnInit = env.FAKE_CODEX_FAIL_INIT === "1";
const crashAfterInit = env.FAKE_CODEX_CRASH_AFTER_INIT === "1";
const echoOnEnabled = env.FAKE_CODEX_ECHO !== "0";
const turnDelayMs = parseInt(env.FAKE_CODEX_TURN_DELAY_MS ?? "10", 10);
const responseDelayMs = parseInt(env.FAKE_CODEX_RESPONSE_DELAY_MS ?? "0", 10);
const startBanner = env.FAKE_CODEX_BANNER;

if (startBanner) {
  process.stderr.write(`${startBanner}\n`);
}

let threadCount = 0;
const turns = new Map();

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function emit(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (typeof msg.method !== "string") return;

  const id = msg.id;
  switch (msg.method) {
    case "initialize":
      if (failOnInit) {
        respondError(id, -32603, "init-fail");
        process.exit(2);
      }
      respond(id, { v: 1 });
      if (crashAfterInit) {
        setTimeout(() => process.exit(7), 5);
      }
      break;
    case "thread/start":
      threadCount += 1;
      respond(id, { thread: { id: `thread-${threadCount}` } });
      break;
    case "turn/start": {
      const turnId = `turn-${id}`;
      const params = msg.params ?? {};
      if (responseDelayMs > 0) {
        setTimeout(() => respond(id, { turnId }), responseDelayMs);
      } else {
        respond(id, { turnId });
      }
      const cancelKey = params.threadId ?? null;
      const timer = setTimeout(() => {
        emit("turn/started", { turnId, threadId: params.threadId });
        if (echoOnEnabled) {
          emit("item/started", {
            turnId,
            item: { type: "userMessage", content: [{ type: "text", text: params.input }] },
          });
          emit("item/completed", {
            turnId,
            item: {
              type: "agentMessage",
              content: [{ type: "text", text: `echo: ${params.input}` }],
            },
          });
        }
        emit("turn/completed", { turnId });
        turns.delete(turnId);
      }, turnDelayMs);
      turns.set(turnId, { timer, cancelKey });
      break;
    }
    case "turn/cancel": {
      const params = msg.params ?? {};
      const t = turns.get(params.turnId);
      if (t) {
        clearTimeout(t.timer);
        turns.delete(params.turnId);
        emit("turn/cancelled", { turnId: params.turnId });
        respond(id, { cancelled: true });
      } else {
        respond(id, { cancelled: false });
      }
      break;
    }
    case "shutdown":
      respond(id, {});
      setTimeout(() => process.exit(0), 5);
      break;
    default:
      if (id !== undefined) {
        respondError(id, -32601, `method not found: ${msg.method}`);
      }
  }
});

process.stdin.on("end", () => {
  setTimeout(() => process.exit(0), 5);
});
