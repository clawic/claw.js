import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import { resolveCodexConfigPath, resolveCodexProjectConfigPath } from "@clawjs/core";

test("Codex config route resolves through the shared storage boundary", () => {
  assert.equal(resolveCodexConfigPath("/Users/demo"), "/Users/demo/.codex/config.toml");
  assert.equal(resolveCodexProjectConfigPath("/Users/demo/project"), "/Users/demo/project/.codex/config.toml");
});

test("MCP config consumers do not rebuild the default Codex config route", () => {
  const mcpCommandSource = fs.readFileSync(new URL("./v1-data-secondary-commands.ts", import.meta.url), "utf8");
  const searchSource = fs.readFileSync(new URL("./cli-search-source-indexers-secondary.ts", import.meta.url), "utf8");

  assert.match(mcpCommandSource, /resolveCodexConfigPath\(input\.homeDir\)/);
  assert.match(mcpCommandSource, /resolveCodexProjectConfigPath\(path\.resolve/);
  assert.match(searchSource, /resolveCodexConfigPath\(os\.homedir\(\)\)/);
  assert.equal(mcpCommandSource.includes('path.join(os.homedir(), ".codex", "config.toml")'), false);
  assert.equal(mcpCommandSource.includes('path.join(path.resolve(input.cwd, expandHome(input.flags.project || input.flags.cwd || input.cwd)), ".codex", "config.toml")'), false);
  assert.equal(searchSource.includes('path.join(os.homedir(), ".codex", "config.toml")'), false);
});
