import { test } from "node:test";
import assert from "node:assert/strict";

import { bootTestApp, jsonFetch } from "./_helpers.ts";

test("approvals: two-stage workflow approves and emits completed", async () => {
  const { baseUrl, adminToken, cleanup } = await bootTestApp();
  try {
    const ws = await jsonFetch<{ workspace: { id: string } }>(baseUrl, adminToken, "/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "approval-ws" }),
    });
    const workspaceId = ws.body.workspace.id;
    const connect = await jsonFetch<{ account: { id: string } }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/channels/connect/devnull`, {
      method: "POST",
      body: JSON.stringify({ display_name: "dev", provider_account_id: "a" }),
    });
    const accountId = connect.body.account.id;
    const post = await jsonFetch<{ post: { id: string } }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/posts`, {
      method: "POST",
      body: JSON.stringify({ accounts: [accountId], variants: [{ is_original: true, blocks: [{ body: "x" }] }] }),
    });
    const wf = await jsonFetch<{ workflow: { id: string } }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/approvals/workflows`, {
      method: "POST",
      body: JSON.stringify({
        name: "copy-then-legal",
        stages: [
          { order: 1, name: "copy", all_required: true },
          { order: 2, name: "legal", all_required: true },
        ],
      }),
    });
    const start = await jsonFetch<{ id: string }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/approvals`, {
      method: "POST",
      body: JSON.stringify({ post_id: post.body.post.id, workflow_id: wf.body.workflow.id }),
    });
    const stage1 = await jsonFetch<{ finalState: string }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/approvals/${start.body.id}/decisions`, {
      method: "POST",
      body: JSON.stringify({ stage_index: 0, reviewer_user_id: "u1", decision: "approve" }),
    });
    assert.equal(stage1.body.finalState, "pending");
    const stage2 = await jsonFetch<{ finalState: string }>(baseUrl, adminToken, `/v1/workspaces/${workspaceId}/approvals/${start.body.id}/decisions`, {
      method: "POST",
      body: JSON.stringify({ stage_index: 1, reviewer_user_id: "u2", decision: "approve" }),
    });
    assert.equal(stage2.body.finalState, "approved");
  } finally {
    await cleanup();
  }
});
