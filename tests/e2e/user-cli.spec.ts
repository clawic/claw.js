import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function clawBin(rootDir: string): string {
  return path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
}

test("UserSpec CLI stores verified human facts and omits pending proposals", async ({ page }) => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-user-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const baseArgs = ["--workspace", workspaceDir, "--json"];
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "USER.md"), "Manual user note.\n");

  await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "init", "--name", "Test User", ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "set", "identity.displayName", "Test User", ...baseArgs,
  ], { cwd: rootDir });
  const pending = await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "propose", "residence.city", "Pending City", "--source", "conversation", ...baseArgs,
  ], { cwd: rootDir });
  const pendingPayload = JSON.parse(pending.stdout) as { id: string };

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "compile", ...baseArgs], { cwd: rootDir });
  const firstCompiled = fs.readFileSync(path.join(workspaceDir, "USER.md"), "utf8");
  expect(firstCompiled).toContain("Manual user note.");
  expect(firstCompiled).toContain("CLAWJS:user-spec:START");
  expect(firstCompiled).toContain("Display Name: Test User");
  expect(firstCompiled).not.toContain("Pending City");

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "verify", pendingPayload.id, ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "compile", ...baseArgs], { cwd: rootDir });
  const verifiedCompiled = fs.readFileSync(path.join(workspaceDir, "USER.md"), "utf8");
  expect(verifiedCompiled).toContain("City: Pending City");

  await page.setContent(`<main><h1>UserSpec CLI</h1><pre>${verifiedCompiled.replace(/[<>&]/g, "")}</pre></main>`);
  await saveArtifactScreenshot(page, "user-cli-compiled.png");
});

test("UserSpec CLI resolves default users, multi-user profiles, and agent assignments", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-user-multi-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "init", "--name", "Default Human", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "init", "parent", "--name", "Parent Human", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "set", "identity.role", "default operator", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "set", "identity.role", "family admin", "--user", "parent", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "assign", "parent", "--agent", "family-agent", ...baseArgs], { cwd: rootDir });

  const fallback = await execFileAsync(process.execPath, [clawBin(rootDir), "user", "preview", ...baseArgs], { cwd: rootDir });
  expect(fallback.stdout).toContain("Default Human");
  expect(fallback.stdout).toContain("default operator");

  const assigned = await execFileAsync(process.execPath, [clawBin(rootDir), "user", "preview", "--agent", "family-agent", ...baseArgs], { cwd: rootDir });
  expect(assigned.stdout).toContain("Parent Human");
  expect(assigned.stdout).toContain("family admin");
});

test("UserSpec CLI rejects behavior preferences that belong in rules", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-user-boundaries-"));
  const workspaceDir = path.join(tempRoot, "workspace");

  await expect(execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "set", "communication.verbosity", "concise", "--workspace", workspaceDir, "--json",
  ], { cwd: rootDir }))
    .rejects
    .toMatchObject({
      stdout: expect.stringContaining("Behavior preferences belong in rules"),
    });
});
