import { clawApiPath } from "@clawjs/core";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { startContentServer } from "./helpers.ts";

const servers: Array<Awaited<ReturnType<typeof startContentServer>>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startContentServer("content-backend");
  servers.push(server);
  return server;
}

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@content.local", password: "content-admin" }),
  });
  const payload = await response.json() as { accessToken: string };
  return payload.accessToken;
}

async function requestJson(baseUrl: string, token: string, path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body !== undefined && !headers["content-type"]) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const payload = await response.json();
  return { response, payload };
}

test("content backend covers brands, destinations, approvals, scheduling, runs, retries, fixtures, and read models", async () => {
  const server = await boot();
  const token = await login(server.baseUrl);

  const brandResponse = await requestJson(server.baseUrl, token, clawApiPath("brands"), {
    method: "POST",
    body: JSON.stringify({ name: "Acme", description: "Primary brand", voiceSummary: "Direct" }),
  });
  const brandId = (brandResponse.payload as { brand: { id: string } }).brand.id;

  const campaignResponse = await requestJson(server.baseUrl, token, clawApiPath("campaigns"), {
    method: "POST",
    body: JSON.stringify({ brandId, name: "Spring Launch", status: "active" }),
  });
  const campaignId = (campaignResponse.payload as { campaign: { id: string } }).campaign.id;

  const manualDestination = await requestJson(server.baseUrl, token, clawApiPath("destinations"), {
    method: "POST",
    body: JSON.stringify({
      brandId,
      name: "LinkedIn Company",
      kind: "linkedin_post",
      publishPolicy: "manual",
      secretRef: "{{linkedin_secret}}",
    }),
  });
  const manualDestinationId = (manualDestination.payload as { destination: { id: string } }).destination.id;

  const autoDestination = await requestJson(server.baseUrl, token, clawApiPath("destinations"), {
    method: "POST",
    body: JSON.stringify({
      brandId,
      name: "Mastodon",
      kind: "mastodon_post",
      publishPolicy: "autopublish",
      secretRef: "{{mastodon_secret}}",
    }),
  });
  const autoDestinationId = (autoDestination.payload as { destination: { id: string } }).destination.id;

  const failingDestination = await requestJson(server.baseUrl, token, clawApiPath("destinations"), {
    method: "POST",
    body: JSON.stringify({
      brandId,
      name: "Bluesky",
      kind: "bluesky_post",
      publishPolicy: "autopublish"
    }),
  });
  const failingDestinationId = (failingDestination.payload as { destination: { id: string } }).destination.id;

  const entryResponse = await requestJson(server.baseUrl, token, clawApiPath("entries"), {
    method: "POST",
    body: JSON.stringify({
      brandId,
      campaignId,
      contentType: "post",
      canonicalFormat: "markdown",
      title: "Launch teaser",
      summary: "Spring launch short teaser",
      canonicalBody: "We are shipping the new editor next week.",
      tags: ["launch", "spring"],
    }),
  });
  const entryId = (entryResponse.payload as { entry: { id: string } }).entry.id;

  await requestJson(server.baseUrl, token, clawApiPath(`entries/${entryId}/assets`), {
    method: "POST",
    body: JSON.stringify({
      driveItemId: "drive_hero_1",
      assetKind: "image",
      name: "Hero image",
      altText: "Product launch artwork",
    }),
  });

  const generatedManual = await requestJson(server.baseUrl, token, clawApiPath(`entries/${entryId}/variants:generate`), {
    method: "POST",
    body: JSON.stringify({ destinationIds: [manualDestinationId] }),
  });
  const manualVariantId = (generatedManual.payload as { variants: Array<{ id: string }> }).variants[0]!.id;

  const manualPlanResponse = await requestJson(server.baseUrl, token, clawApiPath("plans"), {
    method: "POST",
    body: JSON.stringify({
      variantId: manualVariantId,
      scheduledAt: "2026-04-10T09:00:00.000Z",
    }),
  });
  const manualPlanPayload = manualPlanResponse.payload as {
    plan: { id: string; temporalItemId: string | null; status: string };
    approval: { id: string; status: string } | null;
  };
  assert.ok(manualPlanPayload.plan.temporalItemId);
  assert.equal(manualPlanPayload.approval?.status, "pending");

  const approvalId = manualPlanPayload.approval!.id;
  const approved = await requestJson(server.baseUrl, token, clawApiPath(`approvals/${approvalId}/approve`), {
    method: "POST",
    body: JSON.stringify({ comment: "Looks good." }),
  });
  assert.equal((approved.payload as { approval: { status: string } }).approval.status, "approved");

  const runManual = await requestJson(server.baseUrl, token, clawApiPath(`plans/${manualPlanPayload.plan.id}/run`), {
    method: "POST",
  });
  const manualRunPayload = runManual.payload as { run: { status: string; externalId: string }; policy: { decision: string; reasonCodes: string[]; requirements: string[] } };
  assert.equal(manualRunPayload.run.status, "succeeded");
  assert.ok(manualRunPayload.run.externalId.startsWith("linkedin_post_"));
  assert.equal(manualRunPayload.policy.decision, "allow");
  assert.equal(manualRunPayload.policy.reasonCodes.includes("external_review_required"), true);
  assert.equal(manualRunPayload.policy.requirements.includes("human_review"), true);

  const rerunManual = await requestJson(server.baseUrl, token, clawApiPath(`plans/${manualPlanPayload.plan.id}/run`), {
    method: "POST",
  });
  assert.equal((rerunManual.payload as { run: { id: string } }).run.id, (runManual.payload as { run: { id: string } }).run.id);

  const generatedAuto = await requestJson(server.baseUrl, token, clawApiPath(`entries/${entryId}/variants:generate`), {
    method: "POST",
    body: JSON.stringify({ destinationIds: [autoDestinationId] }),
  });
  const autoVariantId = (generatedAuto.payload as { variants: Array<{ id: string }> }).variants[0]!.id;
  const autoPlan = await requestJson(server.baseUrl, token, clawApiPath("plans"), {
    method: "POST",
    body: JSON.stringify({ variantId: autoVariantId }),
  });
  const autoPlanPayload = autoPlan.payload as {
    plan: { id: string };
    approval: { id: string; status: string } | null;
  };
  assert.equal(autoPlanPayload.approval?.status, "pending");
  const blockedAutoRun = await requestJson(server.baseUrl, token, clawApiPath(`plans/${autoPlanPayload.plan.id}/run`), { method: "POST" });
  assert.equal(blockedAutoRun.response.status, 409);
  assert.equal((blockedAutoRun.payload as { error: { code: string } }).error.code, "approval_required");
  await requestJson(server.baseUrl, token, clawApiPath(`approvals/${autoPlanPayload.approval!.id}/approve`), {
    method: "POST",
    body: JSON.stringify({ comment: "Autopublish still requires explicit approval before publication." }),
  });
  const autoRun = await requestJson(server.baseUrl, token, clawApiPath(`plans/${(autoPlan.payload as { plan: { id: string } }).plan.id}/run`), { method: "POST" });
  assert.equal((autoRun.payload as { run: { status: string } }).run.status, "succeeded");

  const generatedFailing = await requestJson(server.baseUrl, token, clawApiPath(`entries/${entryId}/variants:generate`), {
    method: "POST",
    body: JSON.stringify({ destinationIds: [failingDestinationId] }),
  });
  const failingVariantId = (generatedFailing.payload as { variants: Array<{ id: string }> }).variants[0]!.id;
  const failingPlan = await requestJson(server.baseUrl, token, clawApiPath("plans"), {
    method: "POST",
    body: JSON.stringify({ variantId: failingVariantId }),
  });
  const failingPlanPayload = failingPlan.payload as {
    plan: { id: string };
    approval: { id: string; status: string } | null;
  };
  assert.equal(failingPlanPayload.approval?.status, "pending");
  await requestJson(server.baseUrl, token, clawApiPath(`approvals/${failingPlanPayload.approval!.id}/approve`), {
    method: "POST",
    body: JSON.stringify({ comment: "Approved to verify provider failure handling." }),
  });
  const failingPlanId = failingPlanPayload.plan.id;
  const failingRun = await requestJson(server.baseUrl, token, clawApiPath(`plans/${failingPlanId}/run`), { method: "POST" });
  assert.equal(failingRun.response.status, 500);

  const publications = await requestJson(server.baseUrl, token, clawApiPath("publications"));
  const failedRun = (publications.payload as { runs: Array<{ id: string; status: string }> }).runs.find((run) => run.status === "failed");
  assert.ok(failedRun);

  await requestJson(server.baseUrl, token, clawApiPath(`destinations/${failingDestinationId}`), {
    method: "PUT",
    body: JSON.stringify({ secretRef: "{{bluesky_secret}}" }),
  });
  const retried = await requestJson(server.baseUrl, token, clawApiPath(`publications/${failedRun!.id}/retry`), { method: "POST" });
  assert.equal((retried.payload as { run: { status: string } }).run.status, "succeeded");

  const dashboard = await requestJson(server.baseUrl, token, clawApiPath("app/dashboard"));
  assert.ok(typeof (dashboard.payload as { metrics: { drafts: number } }).metrics.drafts === "number");

  const calendar = await requestJson(server.baseUrl, token, clawApiPath("app/calendar"));
  assert.ok(Array.isArray((calendar.payload as { items: unknown[] }).items));

  const pipeline = await requestJson(server.baseUrl, token, clawApiPath("app/pipeline"));
  assert.equal((pipeline.payload as { columns: unknown[] }).columns.length, 6);

  const composer = await requestJson(server.baseUrl, token, clawApiPath(`app/composer/${entryId}`));
  assert.equal((composer.payload as { entry: { id: string } }).entry.id, entryId);

  const formSchema = await requestJson(server.baseUrl, token, clawApiPath("app/forms/entry.create"));
  assert.equal((formSchema.payload as { id: string }).id, "entry.create");

  const frontendContract = await requestJson(server.baseUrl, token, clawApiPath("app/frontend-contract"));
  assert.equal((frontendContract.payload as { version: string }).version, "1");
});
