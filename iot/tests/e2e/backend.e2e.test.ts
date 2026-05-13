import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildIotApp } from "../../src/server/app.ts";
import { startIotServer } from "./helpers.ts";

const servers: Array<Awaited<ReturnType<typeof startIotServer>>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startIotServer("iot-backend");
  servers.push(server);
  return server;
}

test("iot backend supports semantic actions, scenes, automations, and approvals", async () => {
  const server = await boot();

  const homesResponse = await fetch(`${server.baseUrl}/v1/homes`);
  const homesPayload = await homesResponse.json() as { homes: Array<{ id: string; isDefault: boolean }> };
  assert.equal(homesPayload.homes.length, 1);
  assert.equal(homesPayload.homes[0]?.isDefault, true);

  const lightsOff = await fetch(`${server.baseUrl}/v1/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ family: "light", action: "off", area: "office" }),
  });
  const lightsOffPayload = await lightsOff.json() as { result: { status: string; capabilityUpdates: Array<{ observedValue: unknown }> } };
  assert.equal(lightsOffPayload.result.status, "executed");
  assert.equal(lightsOffPayload.result.capabilityUpdates[0]?.observedValue, false);

  const restricted = await fetch(`${server.baseUrl}/v1/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ family: "lock", selector: "front door", action: "unlock" }),
  });
  const restrictedPayload = await restricted.json() as { result: { status: string; approvalId?: string } };
  assert.equal(restrictedPayload.result.status, "approval_required");
  assert.ok(restrictedPayload.result.approvalId);

  const approvalsResponse = await fetch(`${server.baseUrl}/v1/approvals`);
  const approvalsPayload = await approvalsResponse.json() as { approvals: Array<{ id: string; status: string }> };
  assert.equal(approvalsPayload.approvals[0]?.status, "pending");

  const approvalId = restrictedPayload.result.approvalId!;
  const approved = await fetch(`${server.baseUrl}/v1/approvals/${approvalId}/approve`, {
    method: "POST",
  });
  const approvedPayload = await approved.json() as { result: { approval: { status: string }; result: { status: string } } };
  assert.equal(approvedPayload.result.approval.status, "executed");
  assert.equal(approvedPayload.result.result.status, "executed");

  const scene = await fetch(`${server.baseUrl}/v1/scenes/scene_good_night/activate`, {
    method: "POST",
  });
  const scenePayload = await scene.json() as { result: { scene: { id: string }; results: Array<{ status: string }> } };
  assert.equal(scenePayload.result.scene.id, "scene_good_night");
  assert.equal(scenePayload.result.results.length, 2);

  const automation = await fetch(`${server.baseUrl}/v1/automations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      label: "Office Reset",
      trigger: { type: "manual" },
      actions: [{ family: "light", selector: "office", action: "on" }],
    }),
  });
  const automationPayload = await automation.json() as { automation: { id: string } };
  assert.ok(automationPayload.automation.id);

  const runAutomation = await fetch(`${server.baseUrl}/v1/automations/${automationPayload.automation.id}/run`, {
    method: "POST",
  });
  const runAutomationPayload = await runAutomation.json() as { result: { results: Array<{ status: string }> } };
  assert.equal(runAutomationPayload.result.results[0]?.status, "executed");
});

test("iot backend exposes read-only agent tools", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "iot-tools-"));
  const { app } = buildIotApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(rootDir, ".data"),
      dbPath: path.join(rootDir, ".data", "clawjs.sqlite"),
    },
  });
  try {
    const catalogResponse = await app.inject({ method: "GET", url: "/v1/tools/list" });
    assert.equal(catalogResponse.statusCode, 200);
    const catalog = catalogResponse.json() as {
      tools: Array<{ id: string; riskLevel: string; parameters: { type: string } }>;
    };
    const toolIds = catalog.tools.map((tool) => tool.id);
    for (const expected of [
      "iot.areas.list",
      "iot.automations.create",
      "iot.automations.list",
      "iot.connectors.list",
      "iot.discovery.list",
      "iot.discovery.start",
      "iot.homes.list",
      "iot.policy.evaluate",
      "iot.scenes.activate",
      "iot.scenes.list",
      "iot.things.add",
      "iot.things.control",
      "iot.things.get",
      "iot.things.list",
      "iot.things.remove",
    ]) {
      assert.equal(toolIds.includes(expected), true);
    }
    assert.equal(catalog.tools.find((tool) => tool.id === "iot.things.remove")?.riskLevel, "sensitive");
    assert.equal(catalog.tools.every((tool) => tool.parameters.type === "object"), true);

    const invokeResponse = await app.inject({
      method: "POST",
      url: "/v1/tools/iot.things.list/invoke",
      payload: { arguments: { area: "office" }, invocationId: "test-invoke" },
    });
    assert.equal(invokeResponse.statusCode, 200);
    const invokePayload = invokeResponse.json() as {
      ok: boolean;
      invocationId: string;
      value: { things: Array<{ id: string; areaId: string }> };
    };
    assert.equal(invokePayload.ok, true);
    assert.equal(invokePayload.invocationId, "test-invoke");
    assert.equal(invokePayload.value.things.every((thing) => thing.areaId === "office"), true);
  } finally {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
