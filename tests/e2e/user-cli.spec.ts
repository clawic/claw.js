import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function clawBin(rootDir: string): string {
  return path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs");
}

async function runClaw(rootDir: string, args: string[], options: { env?: NodeJS.ProcessEnv; reject?: boolean } = {}) {
  try {
    return await execFileAsync(process.execPath, [clawBin(rootDir), ...args], {
      cwd: rootDir,
      env: { ...process.env, ...options.env },
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (options.reject === false && error && typeof error === "object" && "stdout" in error && "stderr" in error) {
      return error as { stdout: string; stderr: string };
    }
    throw error;
  }
}

function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout) as T;
}

test("profile CLI projects verified user knowledge through the public v1 surface", async ({ page }) => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-profile-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const env = {
    CLAW_DATA_DIR: path.join(tempRoot, "data"),
    CLAW_DB_PATH: path.join(tempRoot, "data", "core.sqlite"),
  };
  fs.mkdirSync(workspaceDir, { recursive: true });

  await runClaw(rootDir, [
    "knowledge", "fact",
    "--predicate", "prefers_response_style",
    "--value", "direct",
    "--confidence", "0.9",
    "--workspace", workspaceDir,
    "--json",
  ], { env });

  const refreshed = parseJson<{ ok: boolean; data: { sections: number; facts: number }; meta: { canonicalCommand: string } }>((await runClaw(rootDir, [
    "profile", "refresh",
    "--workspace", workspaceDir,
    "--json",
  ], { env })).stdout);
  expect(refreshed.ok).toBe(true);
  expect(refreshed.meta.canonicalCommand).toBe("profile");
  expect(refreshed.data).toMatchObject({ sections: 1, facts: 1 });

  const profile = parseJson<{ ok: boolean; data: { items: Array<{ section: string; contentText: string }> }; meta: { canonicalCommand: string; subcommand: string } }>((await runClaw(rootDir, [
    "profile", "get",
    "--workspace", workspaceDir,
    "--json",
  ], { env })).stdout);
  expect(profile.ok).toBe(true);
  expect(profile.meta).toMatchObject({ canonicalCommand: "profile", subcommand: "get" });
  expect(profile.data.items).toEqual([
    expect.objectContaining({ section: "prefers_response_style", contentText: "direct" }),
  ]);

  const filtered = parseJson<{ ok: boolean; data: { items: Array<{ section: string; contentText: string }> } }>((await runClaw(rootDir, [
    "profile", "list",
    "prefers_response_style",
    "--workspace", workspaceDir,
    "--json",
  ], { env })).stdout);
  expect(filtered.ok).toBe(true);
  expect(filtered.data.items).toHaveLength(1);
  expect(filtered.data.items[0]).toMatchObject({ section: "prefers_response_style", contentText: "direct" });

  await page.setContent(`<main><h1>Profile CLI</h1><pre>${filtered.data.items[0]!.contentText}</pre></main>`);
  await saveArtifactScreenshot(page, "profile-cli-projection.png");
});

test("user CLI remains removed from the public surface and points to profile", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-user-removed-"));
  const result = await runClaw(rootDir, [
    "user", "list",
    "--workspace", path.join(tempRoot, "workspace"),
    "--json",
  ], {
    env: {
      CLAW_DATA_DIR: path.join(tempRoot, "data"),
      CLAW_DB_PATH: path.join(tempRoot, "data", "core.sqlite"),
    },
    reject: false,
  });
  const payload = parseJson<{ ok: boolean; error: { code: string }; meta: { canonicalCommand: string; related: Array<{ canonicalCommand?: string }> } }>(result.stdout);
  expect(payload.ok).toBe(false);
  expect(payload.error.code).toBe("removed_public_command");
  expect(payload.meta.canonicalCommand).toBe("user");
  expect(payload.meta.related.some((entry) => entry.canonicalCommand === "profile")).toBe(true);
});
