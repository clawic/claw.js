import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { MCPProtocolClient } from "./client.ts";
import type { MCPServerRecord } from "./types.ts";

function serverRecord(): MCPServerRecord {
  return {
    id: "mcp-timeout",
    name: "Timeout MCP",
    transport: "http",
    endpoint: "http://127.0.0.1:1/mcp",
    envJson: null,
    enabled: true,
    lastHealthCheckAt: null,
    lastHealthOk: null,
    capabilities: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("MCPProtocolClient", () => {
  it("aborts hung RPC requests when timeoutMs is set", async () => {
    const client = new MCPProtocolClient({
      server: serverRecord(),
      timeoutMs: 15,
      fetchImpl: ((_url, init) => new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      })) as typeof fetch,
    });

    await assert.rejects(
      client.initialize(),
      /mcp rpc initialize timed out after 15ms/,
    );
  });
});
