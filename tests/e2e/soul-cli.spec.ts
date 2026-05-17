import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

test("SoulSpec CLI compiles structured souls into isolated workspace files", async ({ page }) => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-soul-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const binPath = path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs");
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "SOUL.md"), "Manual soul note.\n");

  await execFileAsync(process.execPath, [
    binPath,
    "soul",
    "init",
    "default",
    "--title",
    "Default Soul",
    "--set",
    "communication.directness=high",
    ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [binPath, "soul", "compile", "default", ...baseArgs], { cwd: rootDir });

  const firstCompiled = fs.readFileSync(path.join(workspaceDir, "SOUL.md"), "utf8");
  expect(firstCompiled).toContain("Manual soul note.");
  expect(firstCompiled).toContain("CLAW:soul-spec:START");
  expect(firstCompiled).toContain("Communicate with high directness");

  await execFileAsync(process.execPath, [
    binPath,
    "soul",
    "init",
    "operator",
    "--title",
    "Operator Soul",
    "--set",
    "communication.directness=very_high",
    ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [binPath, "soul", "assign", "operator", "--agent", "ada", "--compile", ...baseArgs], { cwd: rootDir });

  const assignedCompiled = fs.readFileSync(path.join(workspaceDir, "SOUL.md"), "utf8");
  expect(assignedCompiled).toContain("# Operator Soul");
  expect(assignedCompiled).toContain("Communicate with very high directness");
  expect(assignedCompiled).toContain("Manual soul note.");

  const inspect = await execFileAsync(process.execPath, [binPath, "soul", "inspect", "operator", ...baseArgs], { cwd: rootDir });
  expect(inspect.stdout).toContain("\"ok\": true");

  await page.setContent(`<main><h1>SoulSpec CLI</h1><pre>${assignedCompiled.replace(/[<>&]/g, "")}</pre></main>`);
  await saveArtifactScreenshot(page, "soul-cli-compiled.png");
});

test("SoulSpec CLI resolves per-agent souls and default fallback", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-soul-invalid-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const binPath = path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs");
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  await execFileAsync(process.execPath, [
    binPath,
    "soul",
    "init",
    "research",
    "--preset",
    "researcher",
    "--title",
    "Research Soul",
    ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [binPath, "soul", "assign", "research", "--agent", "grace", ...baseArgs], { cwd: rootDir });
  const grace = await execFileAsync(process.execPath, [binPath, "soul", "inspect", "--agent", "grace", ...baseArgs], { cwd: rootDir });
  expect(grace.stdout).toContain("Research Soul");
  const fallback = await execFileAsync(process.execPath, [binPath, "soul", "preview", "--agent", "unassigned-agent", ...baseArgs], { cwd: rootDir });
  expect(fallback.stdout).toContain("Default Soul");
});

test("SoulSpec CLI rejects pre-v1 structured souls", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-soul-prev1-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const stateDir = path.join(workspaceDir, ".claw");
  const binPath = path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "souls.json"), JSON.stringify({
    schemaVersion: 1,
    specs: [{
      schemaVersion: 1,
      id: "prev1",
      title: "Pre-v1 Soul",
      extends: ["balanced"],
      modules: { communication: { settings: { directness: "very_high" }, directives: ["Keep the migrated rule."] } },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    assignments: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  }, null, 2));
  let inspectError: unknown;
  try {
    await execFileAsync(process.execPath, [binPath, "soul", "inspect", "prev1", "--workspace", workspaceDir, "--json"], { cwd: rootDir });
  } catch (error) {
    inspectError = error;
  }
  expect(inspectError).toMatchObject({ code: 1 });
  expect(`${(inspectError as { stdout?: string })?.stdout ?? ""}\n${(inspectError as { stderr?: string })?.stderr ?? ""}`)
    .toContain("Unrecognized key");
});

test("SoulSpec CLI rejects invalid structured setting values", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-soul-invalid-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const binPath = path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs");
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  let initError: unknown;
  try {
    await execFileAsync(process.execPath, [
      binPath,
      "soul",
      "init",
      "broken",
      "--set",
      "communication.directness=sideways",
      ...baseArgs,
    ], { cwd: rootDir });
  } catch (error) {
    initError = error;
  }
  expect(initError).toMatchObject({ code: 1 });
  expect(`${(initError as { stdout?: string })?.stdout ?? ""}\n${(initError as { stderr?: string })?.stderr ?? ""}`)
    .toContain("Invalid enum value");
});
