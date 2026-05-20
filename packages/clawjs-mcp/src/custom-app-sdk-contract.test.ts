import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { buildMCPApp } from "./app.ts";

const CANONICAL_CAPABILITY_SURFACES = ["sdk", "cli", "serviceApi", "mcp", "relay", "hostBridge"];

function assertCompleteResolvedSurfaces(
  capabilities: Array<{ id: string; surfaces: Array<{ surface: string; status: string; ref?: string }> }>,
): void {
  for (const capability of capabilities) {
    assert.deepEqual(capability.surfaces.map((surface) => surface.surface), CANONICAL_CAPABILITY_SURFACES, capability.id);
    for (const surface of capability.surfaces) {
      assert.notEqual(surface.status, "pending", `${capability.id}:${surface.surface}`);
      if (surface.status === "available") {
        assert.equal(Boolean(surface.ref), true, `${capability.id}:${surface.surface}`);
      } else {
        assert.equal(surface.ref, undefined, `${capability.id}:${surface.surface}`);
      }
    }
  }
}

describe("MCP custom app SDK contract boundary", () => {
  it("exposes SDK contracts as metadata without executing capability calls", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-mcp-custom-app-sdk-"));
    const { app, config } = buildMCPApp({
      config: {
        dataDir,
        sharedSecret: "test-secret",
      },
    });

    try {
      const http = await app.inject({
        method: "GET",
        url: "/v1/mcp/expose/custom-app-sdk",
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(http.statusCode, 200);
      const payload = http.json() as {
        mcpRole: string;
        richUiRuntime: string;
        executionBoundary: {
          kind: string;
          executesCapabilityCalls: boolean;
          richUiExecutionPath: string;
          nonExecutableSurfaces: string[];
          dbSearchExecution: string;
        };
        capabilities: Array<{ id: string; surfaces: Array<{ surface: string; status: string; ref?: string }> }>;
      };
      assert.equal(payload.mcpRole, "inspection_validation_contract_resource");
      assert.equal(payload.richUiRuntime, "sdk_host_bridge_not_mcp_process");
      assert.equal(payload.executionBoundary.kind, "metadata_only_contract_catalog");
      assert.equal(payload.executionBoundary.executesCapabilityCalls, false);
      assert.equal(payload.executionBoundary.richUiExecutionPath, "sdk_host_bridge");
      assert.equal(payload.executionBoundary.nonExecutableSurfaces.includes("mcp.custom_app_sdk"), true);
      assert.equal(payload.executionBoundary.dbSearchExecution, "host_bridge_only");
      assertCompleteResolvedSurfaces(payload.capabilities);

      const rpc = await app.inject({
        method: "POST",
        url: "/v1/mcp/expose/rpc",
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "clawjs.custom_app_sdk", arguments: {} },
        },
      });
      assert.equal(rpc.statusCode, 200);
      assert.equal(rpc.json().result.content.executionBoundary.executesCapabilityCalls, false);
      assert.equal(rpc.json().result.content.executionBoundary.nonExecutableSurfaces.includes("mcp.custom_app_sdk"), true);
      assertCompleteResolvedSurfaces(rpc.json().result.content.capabilities);
    } finally {
      await app.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
