import { test } from "node:test";
import assert from "node:assert/strict";

import { bootTestApp, jsonFetch } from "./_helpers.ts";

test("queue resolver assigns next free slot", async () => {
  const { baseUrl, adminToken, cleanup } = await bootTestApp();
  try {
    const ws = await jsonFetch<{ workspace: { id: string } }>(baseUrl, adminToken, "/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "queue-ws" }),
    });
    const workspaceId = ws.body.workspace.id;
    const connect = await jsonFetch<{ account: { id: string } }>(baseUrl, adminToken, `/v1/ws/${workspaceId}/channels/connect/devnull`, {
      method: "POST",
      body: JSON.stringify({ display_name: "dev", provider_account_id: "q" }),
    });
    const accountId = connect.body.account.id;
    const queue = await jsonFetch<{ queue: { id: string } }>(baseUrl, adminToken, `/v1/ws/${workspaceId}/queues`, {
      method: "POST",
      body: JSON.stringify({ name: "evergreen" }),
    });
    const queueId = queue.body.queue.id;
    await jsonFetch(baseUrl, adminToken, `/v1/ws/${workspaceId}/queues/${queueId}/slots`, {
      method: "POST",
      body: JSON.stringify({ day_of_week: (new Date().getUTCDay() + 1) % 7, time_of_day: "09:00" }),
    });
    await jsonFetch(baseUrl, adminToken, `/v1/ws/${workspaceId}/queues/${queueId}/accounts`, {
      method: "POST",
      body: JSON.stringify({ channel_account_id: accountId }),
    });
    const post = await jsonFetch<{ post: { id: string } }>(baseUrl, adminToken, `/v1/ws/${workspaceId}/posts`, {
      method: "POST",
      body: JSON.stringify({
        accounts: [accountId],
        editorial_status: "ready",
        variants: [{ is_original: true, blocks: [{ body: "q" }] }],
      }),
    });
    await jsonFetch(baseUrl, adminToken, `/v1/ws/${workspaceId}/queues/${queueId}/entries`, {
      method: "POST",
      body: JSON.stringify({ post_id: post.body.post.id }),
    });
    const fetched = await jsonFetch<{ post: { scheduled_at: number | null; publish_status: string } }>(baseUrl, adminToken, `/v1/ws/${workspaceId}/posts/${post.body.post.id}`);
    assert.ok(fetched.body.post.scheduled_at && fetched.body.post.scheduled_at > Date.now(), "expected post to have a future scheduled_at");
    assert.equal(fetched.body.post.publish_status, "scheduled");
  } finally {
    await cleanup();
  }
});
