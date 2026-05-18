import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "vitest";

import { GET, POST } from "../app/api/search/index/route.ts";

let previousSearchDbPath: string | undefined;
let tempDir: string;

beforeEach(() => {
  previousSearchDbPath = process.env.CLAW_SEARCH_DB_PATH;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-showcase-search-index-"));
  process.env.CLAW_SEARCH_DB_PATH = path.join(tempDir, "search.sqlite");
});

afterEach(() => {
  if (previousSearchDbPath === undefined) {
    delete process.env.CLAW_SEARCH_DB_PATH;
  } else {
    process.env.CLAW_SEARCH_DB_PATH = previousSearchDbPath;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Search Index route onboards selected full-profile sources and queues optional rebuilds", async () => {
  const initial = await responseJson(await GET(new Request("http://localhost/api/search/index?profile=full")));
  assert.equal(sourceState(initial, "local.files"), "disabled");
  assert.equal(sourceState(initial, "web.ingested"), "disabled");

  const response = await POST(new Request("http://localhost/api/search/index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "onboard",
      sources: ["local.files", "web.ingested", "local.files"],
      rebuild: true,
      profile: "full",
    }),
  }));
  const payload = await responseJson(response);

  assert.equal(response.status, 200);
  assert.equal(sourceState(payload, "local.files"), "enabled");
  assert.equal(sourceState(payload, "web.ingested"), "enabled");
  assert.equal(sourceBacklog(payload, "local.files"), 1);
  assert.equal(sourceBacklog(payload, "web.ingested"), 1);
  assert.equal(payload.jobs.filter((job: { source: string; operation: string }) => job.operation === "rebuild" && job.source === "local.files").length, 1);
  assert.equal(payload.jobs.filter((job: { source: string; operation: string }) => job.operation === "rebuild" && job.source === "web.ingested").length, 1);
});

test("Search Index route exposes first-run onboarding guidance", async () => {
  const payload = await responseJson(await GET(new Request("http://localhost/api/search/index?profile=full")));

  assert.equal(sourceSetupKind(payload, "local.files"), "local_root");
  assert.equal(sourceExternalPending(payload, "local.files"), false);
  assert.equal(sourceSetupKind(payload, "native.system"), "signed_host");
  assert.equal(sourceExternalPending(payload, "native.system"), true);
  assert.ok(payload.onboarding.setupRequiredSourceIds.includes("local.files"));
  assert.ok(payload.onboarding.setupRequiredSourceIds.includes("web.ingested"));
  assert.ok(payload.onboarding.setupRequiredSourceIds.includes("external.cache"));
  assert.ok(payload.onboarding.externalPendingSourceIds.includes("native.system"));
  assert.ok(!payload.onboarding.defaultSelectedSourceIds.includes("native.system"));
});

test("Search Index route rejects onboard requests for unknown sources", async () => {
  const response = await POST(new Request("http://localhost/api/search/index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "onboard", sources: ["missing.source"], profile: "full" }),
  }));
  const payload = await responseJson(response);

  assert.equal(response.status, 404);
  assert.equal(payload.error, "Unknown search source: missing.source");
});

async function responseJson(response: Response): Promise<{
  error?: string;
  onboarding: {
    defaultSelectedSourceIds: string[];
    setupRequiredSourceIds: string[];
    externalPendingSourceIds: string[];
  };
  sources: Array<{ id: string; state: string; backlog: number; setupKind: string; externalPending: boolean }>;
  jobs: Array<{ source: string; operation: string }>;
}> {
  return await response.json();
}

function sourceState(payload: { sources: Array<{ id: string; state: string }> }, id: string): string | undefined {
  return payload.sources.find((source) => source.id === id)?.state;
}

function sourceBacklog(payload: { sources: Array<{ id: string; backlog: number }> }, id: string): number | undefined {
  return payload.sources.find((source) => source.id === id)?.backlog;
}

function sourceSetupKind(payload: { sources: Array<{ id: string; setupKind: string }> }, id: string): string | undefined {
  return payload.sources.find((source) => source.id === id)?.setupKind;
}

function sourceExternalPending(payload: { sources: Array<{ id: string; externalPending: boolean }> }, id: string): boolean | undefined {
  return payload.sources.find((source) => source.id === id)?.externalPending;
}
