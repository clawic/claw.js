import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type {
  ConnectorCredentialLease,
  ConnectorCredentialLeaseBroker,
  ConnectorCredentialLeaseRequest,
} from "./credential-lease-broker.ts";
import { runConnectorOperation } from "./operation-runner.ts";
import { runConnectorSource } from "./source-runner.ts";
import type { ConnectorCatalog } from "./types.ts";

describe("connector credential lease broker", () => {
  it("executes authenticated actions only through acquire, heartbeat, release, and audit", async () => {
    const calls: string[] = [];
    let acquiredRequest: ConnectorCredentialLeaseRequest | null = null;
    const broker = fixtureBroker(calls, (request) => {
      acquiredRequest = request;
      return fixtureLease(request, { bot: "leased-token" });
    });

    const result = await runConnectorOperation({
      catalog: fixtureCatalog(),
      operationId: "chat_service.action.send-message",
      dryRun: false,
      input: {
        values: { channel: "general", text: "hello" },
        secretRefs: { bot: "secret://bot" },
      },
      credentialBroker: broker,
      leasePolicy: {
        purpose: "live_smoke",
        scopes: ["telegram:sendMessage"],
        ttlSeconds: 60,
        costPolicy: { mode: "free_only" },
      },
      executor: {
        async execute(ctx) {
          assert.deepEqual(ctx.secrets, { bot: "leased-token" });
          return { ok: true, channel: ctx.values.channel };
        },
      },
    });

    assert.equal(result.status, "executed");
    assert.equal(result.credentialLeaseId, "lease_chat_service.action.send-message");
    assert.equal(result.credentialLeaseReleased, true);
    assert.equal(acquiredRequest?.purpose, "live_smoke");
    assert.deepEqual(acquiredRequest?.secretRefs, { bot: "secret://bot" });
    assert.deepEqual(acquiredRequest?.scopes, ["telegram:sendMessage"]);
    assert.equal(acquiredRequest?.ttlSeconds, 60);
    assert.deepEqual(acquiredRequest?.costPolicy, { mode: "free_only" });
    assert.deepEqual(calls, [
      "acquire",
      "audit:acquire",
      "heartbeat",
      "audit:heartbeat",
      "release",
      "audit:release",
    ]);
  });

  it("executes authenticated sources through the same lease lifecycle", async () => {
    const calls: string[] = [];
    const result = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      dryRun: false,
      input: {
        values: { channel: "general" },
        secretRefs: { bot: "secret://bot" },
      },
      credentialBroker: fixtureBroker(calls, (request) => fixtureLease(request, { bot: "leased-token" })),
      executor: {
        async start(ctx) {
          assert.deepEqual(ctx.secrets, { bot: "leased-token" });
          assert.equal(ctx.plan.status, "source_plan");
          return { subscribed: true };
        },
      },
    });

    assert.equal(result.status, "source_started");
    assert.equal(result.credentialLeaseReleased, true);
    assert.deepEqual(calls, [
      "acquire",
      "audit:acquire",
      "heartbeat",
      "audit:heartbeat",
      "release",
      "audit:release",
    ]);
  });

  it("releases the lease when an executor fails", async () => {
    const calls: string[] = [];
    await assert.rejects(
      runConnectorOperation({
        catalog: fixtureCatalog(),
        operationId: "chat_service.action.send-message",
        dryRun: false,
        input: {
          values: { channel: "general", text: "hello" },
          secretRefs: { bot: "secret://bot" },
        },
        credentialBroker: fixtureBroker(calls, (request) => fixtureLease(request, { bot: "leased-token" })),
        executor: {
          async execute() {
            throw new Error("provider failed");
          },
        },
      }),
      /provider failed/,
    );

    assert.ok(calls.includes("release"));
    assert.ok(calls.includes("audit:release"));
  });

  it("fails closed and releases when a lease omits required secret material", async () => {
    const calls: string[] = [];
    await assert.rejects(
      runConnectorOperation({
        catalog: fixtureCatalog(),
        operationId: "chat_service.action.send-message",
        dryRun: false,
        input: {
          values: { channel: "general", text: "hello" },
          secretRefs: { bot: "secret://bot" },
        },
        credentialBroker: fixtureBroker(calls, (request) => fixtureLease(request, {})),
        executor: {
          async execute() {
            throw new Error("executor must not start");
          },
        },
      }),
      /missing required secrets: bot/,
    );

    assert.deepEqual(calls, ["acquire", "audit:acquire", "release", "audit:release"]);
  });
});

function fixtureCatalog(): ConnectorCatalog {
  return {
    version: 1,
    apps: [{
      id: "chat_service",
      name: "Chat Service",
      authFieldNames: ["bot"],
      fields: [{ name: "bot", type: "string", optional: false, secret: true }],
      operations: [
        {
          id: "chat_service.action.send-message",
          appId: "chat_service",
          kind: "action",
          name: "Send Message",
          fields: [
            { name: "channel", type: "string", optional: false },
            { name: "text", type: "string", optional: false },
          ],
          authFieldNames: ["bot"],
        },
        {
          id: "chat_service.source.new-message",
          appId: "chat_service",
          kind: "source",
          name: "New Message",
          fields: [{ name: "channel", type: "string", optional: false }],
          authFieldNames: ["bot"],
          source: {
            delivery: "polling",
            usesTimer: true,
            usesHttp: false,
            usesServiceDb: false,
          },
        },
      ],
    }],
  };
}

function fixtureBroker(
  calls: string[],
  makeLease: (request: ConnectorCredentialLeaseRequest) => ConnectorCredentialLease,
): ConnectorCredentialLeaseBroker {
  return {
    async acquire(request) {
      calls.push("acquire");
      return makeLease(request);
    },
    async heartbeat() {
      calls.push("heartbeat");
    },
    async release() {
      calls.push("release");
    },
    audit(event) {
      calls.push(`audit:${event.event}`);
    },
  };
}

function fixtureLease(
  request: ConnectorCredentialLeaseRequest,
  secrets: Record<string, string>,
): ConnectorCredentialLease {
  return {
    id: `lease_${request.operationId}`,
    provider: request.provider,
    appId: request.appId,
    operationId: request.operationId,
    scopes: request.scopes,
    issuedAt: "2026-05-14T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    secrets,
  };
}
