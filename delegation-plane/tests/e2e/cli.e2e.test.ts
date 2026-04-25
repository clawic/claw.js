import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildDelegationPlaneApp } from "../../src/server/app.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cliPath = path.join(repoRoot, "delegation-plane", "src", "bin", "cli.ts");
const execFileAsync = promisify(execFile);

const state: {
  tmpDir: string;
  baseUrl: string;
  stop?: () => Promise<void>;
} = {
  tmpDir: "",
  baseUrl: "",
};

async function cli(args: string[]): Promise<string> {
  const result = await execFileAsync("tsx", [cliPath, "--url", state.baseUrl, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.stdout;
}

describe("delegation-plane cli e2e", () => {
  beforeEach(async () => {
    state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "delegation-plane-cli-e2e-"));
    const built = await buildDelegationPlaneApp({
      config: {
        host: "127.0.0.1",
        port: 0,
        dataDir: path.join(state.tmpDir, "data"),
        databaseFile: path.join(state.tmpDir, "data", "delegation.sqlite"),
        startScheduler: false,
      },
    });
    const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
    state.baseUrl = address.replace(/\/$/, "");
    state.stop = async () => {
      await built.app.close();
    };
  });

  afterEach(async () => {
    await state.stop?.();
  });

  test("operator can create, inspect, retry, cancel, and list stuck work", async () => {
    const created = JSON.parse(await cli(["graph", "create", "--objective", "CLI delegation"]));
    const graphId = created.graph.id as string;
    const rootNodeId = created.graph.rootNodeId as string;
    assert.ok(graphId);

    const listed = JSON.parse(await cli(["graph", "list"]));
    assert.equal(listed.graphs.some((graph: any) => graph.id === graphId), true);

    const tree = await cli(["graph", "inspect", graphId, "--tree"]);
    assert.match(tree, /Root delegation/);

    const cancelled = JSON.parse(await cli(["node", "cancel", rootNodeId]));
    assert.equal(cancelled.node.status, "cancelled");

    const retried = JSON.parse(await cli(["node", "retry", rootNodeId]));
    assert.equal(retried.node.status, "ready");

    const stuck = JSON.parse(await cli(["stuck"]));
    assert.deepEqual(stuck.nodes, []);
  });
});
