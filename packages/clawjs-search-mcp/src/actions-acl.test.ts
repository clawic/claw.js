import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SearchStore, createFrameworkSearchSourceManifest } from "@clawjs/search";

import { createSearchMcpTools } from "./index.ts";

test("Search MCP action tools honor actor and scope ACLs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-mcp-actions-acl-"));
  const store = new SearchStore(path.join(dir, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.upsertDocument({
      id: "documents.blocks:restricted",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Restricted launch notes",
      body: "Restricted launch notes for MCP action ACL checks.",
      permissions: { allowedActors: ["agent:codex"], requiredScopes: ["project-alpha"] },
      actions: [{ id: "open", kind: "open", label: "Open restricted note", grant: "search.documents.open", requiresApproval: false }],
    });

    const tools = createSearchMcpTools(store);
    const actionsTool = tools.find((tool) => tool.name === "search.actions.list");
    assert.ok(actionsTool);
    assert.deepEqual(actionsTool.handler({ resultId: "documents.blocks:restricted" }), []);
    assert.deepEqual(actionsTool.handler({
      resultId: "documents.blocks:restricted",
      actor: "agent:codex",
      filters: { scopeId: "project-beta" },
    }), []);
    assert.deepEqual(
      (actionsTool.handler({
        resultId: "documents.blocks:restricted",
        actor: "agent:codex",
        filters: { scopeId: "project-alpha" },
      }) as Array<{ id: string }>).map((action) => action.id),
      ["open"],
    );

    const executeTool = tools.find((tool) => tool.name === "search.actions.execute");
    assert.ok(executeTool);
    assert.throws(
      () => executeTool.handler({
        resultId: "documents.blocks:restricted",
        actionId: "open",
        actor: "agent:codex",
        filters: { scopeId: "project-beta" },
        dryRun: true,
      }),
      /Search action not found/,
    );
    const planned = executeTool.handler({
      resultId: "documents.blocks:restricted",
      actionId: "open",
      actor: "agent:codex",
      filters: { scopeId: "project-alpha" },
      dryRun: true,
    }) as { plan: { status: string; resultId: string; actionId: string }; blocked: boolean };
    assert.equal(planned.plan.status, "planned");
    assert.equal(planned.plan.resultId, "documents.blocks:restricted");
    assert.equal(planned.plan.actionId, "open");
    assert.equal(planned.blocked, false);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
