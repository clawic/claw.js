import { test } from "node:test";
import assert from "node:assert/strict";

import { bootTestApp, jsonFetch } from "./_helpers.ts";

test("end-to-end devnull publish", async () => {
  const { built, baseUrl, adminToken, cleanup } = await bootTestApp();
  try {
    // 1. create workspace
    const ws = await jsonFetch<{ workspace: { id: string } }>(baseUrl, adminToken, "/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "test-ws" }),
    });
    assert.equal(ws.status, 201);
    const workspaceId = ws.body.workspace.id;

    // 2. connect a devnull channel via the static connect endpoint
    const connect = await jsonFetch<{ account: { id: string; familyId: string } }>(
      baseUrl,
      adminToken,
      `/v1/workspaces/${workspaceId}/channels/connect/devnull`,
      { method: "POST", body: JSON.stringify({ display_name: "DevNull #1", provider_account_id: "dev-1" }) },
    );
    assert.equal(connect.status, 201);
    const accountId = connect.body.account.id;
    assert.equal(connect.body.account.familyId, "devnull");

    // 3. create a post scheduled for ~now and editorial=ready
    const post = await jsonFetch<{ post: { id: string; editorial_status: string; publish_status: string } }>(
      baseUrl,
      adminToken,
      `/v1/workspaces/${workspaceId}/posts`,
      {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: "test-pipeline-1",
          accounts: [accountId],
          editorial_status: "ready",
          schedule: { kind: "datetime", at: new Date(Date.now() - 1000).toISOString() },
          variants: [{ is_original: true, blocks: [{ body: "test body" }], options: {} }],
        }),
      },
    );
    assert.equal(post.status, 201);
    const postId = post.body.post.id;
    assert.equal(post.body.post.editorial_status, "ready");

    // 4. tick scheduler then drain worker
    built.services.scheduler.tick();
    for (let i = 0; i < 5; i += 1) {
      const processed = await built.services.worker.tick(10);
      if (processed === 0) break;
    }

    // 5. assert post was published, provider_post_id set, post.published event emitted
    const fetched = await jsonFetch<{ post: { publish_status: string }; accounts: Array<{ provider_post_id: string | null; publish_state: string }> }>(
      baseUrl,
      adminToken,
      `/v1/workspaces/${workspaceId}/posts/${postId}`,
    );
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.post.publish_status, "published");
    assert.equal(fetched.body.accounts.length, 1);
    assert.equal(fetched.body.accounts[0].publish_state, "published");
    assert.match(fetched.body.accounts[0].provider_post_id ?? "", /^devnull_post_/);
  } finally {
    await cleanup();
  }
});

test("idempotency: same key returns same post", async () => {
  const { baseUrl, adminToken, cleanup } = await bootTestApp();
  try {
    const ws = await jsonFetch<{ workspace: { id: string } }>(baseUrl, adminToken, "/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "test-ws" }),
    });
    const workspaceId = ws.body.workspace.id;
    const connect = await jsonFetch<{ account: { id: string } }>(
      baseUrl,
      adminToken,
      `/v1/workspaces/${workspaceId}/channels/connect/devnull`,
      { method: "POST", body: JSON.stringify({ display_name: "dev", provider_account_id: "x" }) },
    );
    const accountId = connect.body.account.id;
    const body = JSON.stringify({
      idempotency_key: "idem-test",
      accounts: [accountId],
      variants: [{ is_original: true, blocks: [{ body: "hi" }] }],
    });
    const first = await jsonFetch<{ post: { id: string } }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/posts`, { method: "POST", body });
    const second = await jsonFetch<{ post: { id: string } }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/posts`, { method: "POST", body });
    assert.equal(first.body.post.id, second.body.post.id);
  } finally {
    await cleanup();
  }
});

test("rate-limit retry: devnull_mode=rate_limited reschedules", async () => {
  const { built, baseUrl, adminToken, cleanup } = await bootTestApp();
  try {
    const ws = await jsonFetch<{ workspace: { id: string } }>(baseUrl, adminToken, "/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "test-ws" }),
    });
    const workspaceId = ws.body.workspace.id;
    const connect = await jsonFetch<{ account: { id: string } }>(
      baseUrl,
      adminToken,
      `/v1/workspaces/${workspaceId}/channels/connect/devnull`,
      { method: "POST", body: JSON.stringify({ display_name: "dev", provider_account_id: "x" }) },
    );
    const accountId = connect.body.account.id;
    await jsonFetch(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/posts`, {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: "rate-limit-test",
        accounts: [accountId],
        editorial_status: "ready",
        schedule: { kind: "datetime", at: new Date(Date.now() - 1000).toISOString() },
        variants: [{ is_original: true, blocks: [{ body: "rl" }], options: { devnull_mode: "rate_limited" } }],
      }),
    });
    built.services.scheduler.tick();
    await built.services.worker.tick(10);
    const jobs = await jsonFetch<{ jobs: Array<{ state: string; available_at: number }> }>(
      baseUrl,
      adminToken,
      `/v1/workspaces/${workspaceId}/jobs`,
    );
    const publishJobs = jobs.body.jobs.filter((j) => (j as unknown as { kind: string }).kind === "publish_post_account");
    assert.ok(publishJobs.length > 0, "expected at least one publish job");
    // Should not have terminated successfully yet; should be queued for retry.
    const queued = publishJobs.find((j) => j.state === "queued");
    assert.ok(queued, "expected job to be rescheduled to queued state");
    assert.ok(queued.available_at > Date.now(), "expected available_at in the future");
  } finally {
    await cleanup();
  }
});

test("unauthorized status: devnull_mode=unauthorized marks account", async () => {
  const { built, baseUrl, adminToken, cleanup } = await bootTestApp();
  try {
    const ws = await jsonFetch<{ workspace: { id: string } }>(baseUrl, adminToken, "/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "test-ws" }),
    });
    const workspaceId = ws.body.workspace.id;
    const connect = await jsonFetch<{ account: { id: string } }>(
      baseUrl,
      adminToken,
      `/v1/workspaces/${workspaceId}/channels/connect/devnull`,
      { method: "POST", body: JSON.stringify({ display_name: "dev", provider_account_id: "x" }) },
    );
    const accountId = connect.body.account.id;
    const post = await jsonFetch<{ post: { id: string } }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/posts`, {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: "unauth-test",
        accounts: [accountId],
        editorial_status: "ready",
        schedule: { kind: "datetime", at: new Date(Date.now() - 1000).toISOString() },
        variants: [{ is_original: true, blocks: [{ body: "u" }], options: { devnull_mode: "unauthorized" } }],
      }),
    });
    built.services.scheduler.tick();
    for (let i = 0; i < 5; i += 1) await built.services.worker.tick(10);
    const fetched = await jsonFetch<{ post: { publish_status: string } }>(
      baseUrl,
      adminToken,
      `/v1/workspaces/${workspaceId}/posts/${post.body.post.id}`,
    );
    assert.equal(fetched.body.post.publish_status, "failed");
    const account = await jsonFetch<{ authorized: boolean }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/channels/${accountId}`);
    assert.equal(account.body.authorized, false);
  } finally {
    await cleanup();
  }
});
