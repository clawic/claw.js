import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { createClaw } from "../../../packages/clawjs-node/src/index.ts";
import { startContentServer } from "./helpers.ts";

const servers: Array<Awaited<ReturnType<typeof startContentServer>>> = [];
const workspaces: string[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
  while (workspaces.length > 0) {
    const dir = workspaces.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sdk content client can create content resources and execute a publish plan", async () => {
  const server = await startContentServer("content-sdk");
  servers.push(server);
  const loginResponse = await fetch(`${server.baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@content.local", password: "content-admin" }),
  });
  const token = (await loginResponse.json() as { accessToken: string }).accessToken;

  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-sdk-workspace-"));
  workspaces.push(workspaceDir);

  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "content-sdk",
      workspaceId: "content-sdk",
      agentId: "content-sdk",
      rootDir: workspaceDir,
    },
    content: {
      baseUrl: server.baseUrl,
      token,
    },
  });

  const brand = await claw.content.brands.create({ name: "SDK Brand" });
  const destination = await claw.content.destinations.create({
    brandId: brand.brand.id,
    name: "SDK Webhook",
    kind: "webhook",
    publishPolicy: "autopublish",
  });
  const entry = await claw.content.entries.create({
    brandId: brand.brand.id,
    title: "SDK entry",
    canonicalBody: "SDK body",
    canonicalFormat: "markdown",
    contentType: "post",
  });
  const generated = await claw.content.entries.generateVariants(entry.entry.id, {
    destinationIds: [destination.destination.id],
  });
  const plan = await claw.content.publish.createPlan({
    variantId: generated.variants[0]!.id,
  });
  assert.equal(plan.approval?.status, "pending");
  await assert.rejects(
    () => claw.content.publish.runNow(plan.plan.id),
    /approved approval request/,
  );
  await claw.content.approvals.approve(plan.approval!.id, {
    comment: "Autopublish still requires explicit approval before publication.",
  });
  const run = await claw.content.publish.runNow(plan.plan.id);

  assert.equal(run.run.status, "succeeded");
  const listed = await claw.content.entries.list();
  assert.ok(listed.entries.some((item) => item.id === entry.entry.id));
});
