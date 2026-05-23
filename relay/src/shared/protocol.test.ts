import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  RELAY_CONNECTOR_FRAME_MAX_BYTES,
  parseConnectorInboundEnvelope,
  parseConnectorOutboundEnvelope,
} from "./protocol.ts";

function encode(value: unknown): string {
  return JSON.stringify(value);
}

describe("relay connector protocol JSON boundary", () => {
  test("accepts valid inbound and outbound connector frames", () => {
    const hello = parseConnectorInboundEnvelope(encode({
      type: "hello",
      payload: {
        tenantId: "tenant",
        connectorId: "connector",
        agentId: "agent",
        version: "1.0.0",
        capabilities: ["sessions.chat"],
        workspaces: [{ workspaceId: "main", displayName: "Main" }],
      },
    }));
    assert.equal(hello.ok, true);
    if (hello.ok) assert.equal(hello.frame.type, "hello");

    const result = parseConnectorInboundEnvelope(encode({
      type: "result",
      requestId: "req-1",
      payload: { ok: true },
    }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.frame.type, "result");

    const invoke = parseConnectorOutboundEnvelope(encode({
      type: "invoke",
      requestId: "req-1",
      tenantId: "tenant",
      agentId: "agent",
      workspaceId: "main",
      operation: "sessions.chat",
      payload: { message: "hello" },
    }));
    assert.equal(invoke.ok, true);
    if (invoke.ok) assert.equal(invoke.frame.type, "invoke");
  });

  test("returns parseable errors for malformed, truncated, incomplete and oversized frames", () => {
    const malformed = parseConnectorInboundEnvelope("{]");
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.error.code, "relay_connector_frame_malformed");

    const truncated = parseConnectorInboundEnvelope(encode({ type: "heartbeat", payload: { timestamp: 1 } }).slice(0, -1));
    assert.equal(truncated.ok, false);
    if (!truncated.ok) assert.equal(truncated.error.code, "relay_connector_frame_truncated");

    const incomplete = parseConnectorOutboundEnvelope(encode({ type: "invoke", requestId: "req-1" }));
    assert.equal(incomplete.ok, false);
    if (!incomplete.ok) assert.equal(incomplete.error.code, "relay_connector_frame_invalid");

    const oversized = parseConnectorInboundEnvelope(" ".repeat(RELAY_CONNECTOR_FRAME_MAX_BYTES + 1));
    assert.equal(oversized.ok, false);
    if (!oversized.ok) {
      assert.equal(oversized.error.code, "relay_connector_frame_oversized");
      assert.equal(oversized.error.maxBytes, RELAY_CONNECTOR_FRAME_MAX_BYTES);
    }
  });

  test("rejects unknown top-level fields before connector peers can rely on them", () => {
    const extraInbound = parseConnectorInboundEnvelope(encode({
      type: "result",
      requestId: "req-1",
      payload: { ok: true },
      grantsApplied: true,
    }));
    assert.equal(extraInbound.ok, false);
    if (!extraInbound.ok) {
      assert.equal(extraInbound.error.code, "relay_connector_frame_unknown_fields");
      assert.deepEqual(extraInbound.error.fields, ["grantsApplied"]);
    }

    const extraOutbound = parseConnectorOutboundEnvelope(encode({
      type: "invoke",
      requestId: "req-1",
      tenantId: "tenant",
      agentId: "agent",
      operation: "sessions.chat",
      payload: {},
      assumedApproval: true,
    }));
    assert.equal(extraOutbound.ok, false);
    if (!extraOutbound.ok) {
      assert.equal(extraOutbound.error.code, "relay_connector_frame_unknown_fields");
      assert.deepEqual(extraOutbound.error.fields, ["assumedApproval"]);
    }
  });
});
