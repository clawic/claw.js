import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";

import type { CommandRunner } from "../runtime/contracts.ts";
import { getSkillSource } from "./sources.ts";

test("external skill searches only pass positive safe integer limits to commands", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner: CommandRunner = {
    async exec(command, args) {
      calls.push({ command, args: [...args] });
      return { stdout: "[]\n", stderr: "", exitCode: 0 };
    },
  };
  const context = {
    runner,
    workspaceDir: fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skill-source-limit-")),
    env: {},
  };

  for (const sourceId of ["clawhub", "clawic"]) {
    const source = getSkillSource(sourceId);
    assert.ok(source.search);

    for (const limit of [undefined, 0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      calls.length = 0;
      await source.search("support", { limit }, context);
      assert.deepEqual(calls[0]?.args.includes("--limit"), false, `${sourceId} should omit unsafe limit ${String(limit)}`);
    }

    calls.length = 0;
    await source.search("support", { limit: 3 }, context);
    assert.deepEqual(calls[0], {
      command: "npx",
      args: ["--yes", sourceId, "search", "support", "--limit", "3"],
    });
  }
});
