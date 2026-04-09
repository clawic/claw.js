import test from "node:test";
import assert from "node:assert/strict";

import { buildTitleSessionSnippet, buildTitlePrompt, generateSessionTitle } from "./title.ts";

test("buildTitleSessionSnippet and buildTitlePrompt normalize transcript excerpts", () => {
  const snippet = buildTitleSessionSnippet([
    { role: "user", content: "  Hello   world " },
    { role: "assistant", content: "Long reply" },
  ]);
  assert.match(snippet, /^USER: Hello world/m);
  assert.match(snippet, /ASSISTANT: Long reply/);

  const prompt = buildTitlePrompt([{ role: "user", content: "hello world" }]);
  assert.match(prompt, /Generate a concise session title/);
  assert.match(prompt, /SESSION:/);
});

test("generateSessionTitle uses gateway first and falls back to CLI or heuristics", async () => {
  const gatewayTitle = await generateSessionTitle({
    messages: [{ role: "user", content: "I want to talk about anxiety at work" }],
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Work anxiety" } }],
    }), { status: 200 }),
  });
  assert.equal(gatewayTitle, "Work anxiety");

  const responsesTitle = await generateSessionTitle({
    messages: [{ role: "user", content: "Review the sales deck" }],
    sessionAdapter: {
      transport: {
        kind: "hybrid",
        streaming: false,
        gatewayKind: "openai-responses",
      },
      gateway: {
        kind: "openai-responses",
        url: "http://127.0.0.1:18789",
      },
      buildCliInvocation() {
        throw new Error("not used");
      },
      supportsGateway: true,
    },
    fetchImpl: async () => new Response(JSON.stringify({
      output_text: "Sales deck review",
    }), { status: 200 }),
  });
  assert.equal(responsesTitle, "Sales deck review");

  const cliTitle = await generateSessionTitle({
    messages: [{ role: "user", content: "I want to talk about anxiety at work" }],
    agentId: "agent-1",
    fetchImpl: async () => new Response("boom", { status: 500 }),
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    runner: {
      async exec() {
        return {
          stdout: "",
          stderr: `Gateway agent failed; falling back to embedded: Error: gateway closed
{
  "payloads": [
    { "text": "Anxiety and work" }
  ]
}`,
          exitCode: 0,
        };
      },
    },
  });
  assert.equal(cliTitle, "Anxiety and work");

  const fallbackTitle = await generateSessionTitle({
    messages: [{ role: "user", content: "I need to organize my thoughts for tomorrow" }],
  });
  assert.equal(fallbackTitle, "I need to organize my thoughts for tomorrow");
});
