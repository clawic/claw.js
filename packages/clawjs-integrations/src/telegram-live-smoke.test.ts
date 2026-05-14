import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type {
  ConnectorCredentialLease,
  ConnectorCredentialLeaseBroker,
  ConnectorCredentialLeaseRequest,
} from "./credential-lease-broker.ts";
import {
  TELEGRAM_LIVE_SMOKE_SCENARIOS,
  runTelegramBrokeredLiveSmoke,
} from "./telegram-live-smoke.ts";
import { TELEGRAM_OFFICIAL_API_COVERAGE } from "./telegram-official-api-matrix.ts";

describe("Telegram brokered live smoke harness", () => {
  it("runs safe brokered smoke checks and reports missing physical prerequisites", async () => {
    const leaseRequests: ConnectorCredentialLeaseRequest[] = [];
    const calls: string[] = [];
    const endpoints: string[] = [];
    const report = await runTelegramBrokeredLiveSmoke({
      broker: fixtureBroker(calls, leaseRequests),
      secretRef: "secret://telegram-bot",
      fetchImpl: telegramFetch(endpoints),
    });

    assert.equal(report.status, "PARTIAL");
    assert.equal(report.credentialLeaseReleased, true);
    assert.deepEqual(calls, ["acquire", "audit:acquire", "heartbeat", "audit:heartbeat", "release", "audit:release"]);
    assert.deepEqual(leaseRequests[0]?.secretRefs, { telegramBotApi: "secret://telegram-bot" });
    assert.deepEqual(leaseRequests[0]?.scopes, ["telegram:getMe", "telegram:getUpdates"]);
    assert.deepEqual(endpoints, ["getMe", "getUpdates"]);
    assert.equal(resultStatus(report, "telegram.get-me"), "PASS");
    assert.equal(resultStatus(report, "telegram.poll-updates"), "PASS");
    assert.equal(resultStatus(report, "telegram.rate-error-handling"), "PASS");
    assert.equal(resultStatus(report, "telegram.send-edit-delete-text"), "EXTERNAL PENDING");
    assert.equal(resultStatus(report, "telegram.webhook-loopback"), "EXTERNAL PENDING");
  });

  it("runs disposable send, edit, delete, and synthetic media when prerequisites are present", async () => {
    const leaseRequests: ConnectorCredentialLeaseRequest[] = [];
    const endpoints: string[] = [];
    const report = await runTelegramBrokeredLiveSmoke({
      broker: fixtureBroker([], leaseRequests),
      secretRef: "secret://telegram-bot",
      chatId: "123",
      mediaPhotoUrl: "https://example.invalid/synthetic.png",
      fetchImpl: telegramFetch(endpoints),
    });

    assert.equal(report.status, "PARTIAL");
    assert.deepEqual(leaseRequests[0]?.scopes, [
      "telegram:getMe",
      "telegram:getUpdates",
      "telegram:sendMessage",
      "telegram:editMessageText",
      "telegram:deleteMessage",
      "telegram:sendPhoto",
    ]);
    assert.deepEqual(endpoints, [
      "getMe",
      "getUpdates",
      "sendMessage",
      "editMessageText",
      "deleteMessage",
      "sendPhoto",
      "deleteMessage",
    ]);
    assert.equal(resultStatus(report, "telegram.send-edit-delete-text"), "PASS");
    assert.equal(resultStatus(report, "telegram.synthetic-photo"), "PASS");
    assert.equal(resultStatus(report, "telegram.rate-error-handling"), "PASS");
  });

  it("keeps sensitive Telegram categories gated outside automated live smoke", () => {
    const manual = TELEGRAM_LIVE_SMOKE_SCENARIOS.filter((scenario) => scenario.lane === "manual_only");
    const blocked = TELEGRAM_LIVE_SMOKE_SCENARIOS.filter((scenario) => scenario.lane === "unsupported_by_policy");

    assert.ok(manual.some((scenario) => scenario.id === "telegram.webhook-loopback"));
    assert.ok(manual.some((scenario) => scenario.id === "telegram.group-admin-authorization"));
    assert.ok(blocked.some((scenario) => scenario.id === "telegram.payments-passport-managed-bot"));
  });

  it("references only classified official Telegram methods", () => {
    const matrixMethods = new Set(TELEGRAM_OFFICIAL_API_COVERAGE.map((entry) => entry.officialMethod));
    const unknown = TELEGRAM_LIVE_SMOKE_SCENARIOS
      .flatMap((scenario) => [...scenario.officialMethods])
      .filter((method) => !matrixMethods.has(method));

    assert.deepEqual(unknown, []);
  });
});

function fixtureBroker(
  calls: string[],
  leaseRequests: ConnectorCredentialLeaseRequest[],
): ConnectorCredentialLeaseBroker {
  return {
    async acquire(request) {
      calls.push("acquire");
      leaseRequests.push(request);
      return fixtureLease(request);
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

function fixtureLease(request: ConnectorCredentialLeaseRequest): ConnectorCredentialLease {
  return {
    id: "telegram-live-lease",
    provider: request.provider,
    appId: request.appId,
    operationId: request.operationId,
    scopes: request.scopes,
    issuedAt: "2026-05-14T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    secrets: { telegramBotApi: "leased-token" },
  };
}

function telegramFetch(endpoints: string[]): typeof fetch {
  return (async (url: string | URL | Request) => {
    const endpoint = String(url).split("/").at(-1) ?? "";
    endpoints.push(endpoint);
    return new Response(JSON.stringify({
      ok: true,
      result: endpoint === "getUpdates"
        ? []
        : { id: 42, is_bot: true, first_name: "Claw", message_id: 100 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function resultStatus(
  report: Awaited<ReturnType<typeof runTelegramBrokeredLiveSmoke>>,
  id: string,
): string | undefined {
  return report.results.find((result) => result.id === id)?.status;
}
