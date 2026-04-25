import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

test("local library assets sync into an isolated workspace without real services", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-library-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const libraryDir = path.join(tempRoot, "library");
  const skillSourceDir = path.join(tempRoot, "namecheap-skill");
  fs.mkdirSync(skillSourceDir, { recursive: true });
  fs.writeFileSync(path.join(skillSourceDir, "skill.json"), JSON.stringify({
    id: "namecheap",
    name: "Namecheap",
    version: "0.1.0",
    description: "Hermetic domain-management skill fixture.",
  }, null, 2));

  const binPath = path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
  const baseArgs = ["--library-dir", libraryDir, "--workspace", workspaceDir, "--json"];
  await execFileAsync(process.execPath, [binPath, "library", "import-skill", "namecheap", "--id", "namecheap", "--path", skillSourceDir, ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [binPath, "library", "create", "ceo-soul", "--kind", "instruction", "--content", "Operate like a pragmatic CEO.", "--projection", "agents", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [binPath, "library", "assign", "namecheap", "--agent", "ada", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [binPath, "library", "assign", "ceo-soul", "--agent", "ada", ...baseArgs], { cwd: rootDir });
  const synced = await execFileAsync(process.execPath, [binPath, "library", "sync", "--agent", "ada", ...baseArgs], { cwd: rootDir });

  expect(synced.stdout).toContain("namecheap");
  expect(fs.existsSync(path.join(workspaceDir, "skills", "namecheap", "skill.json"))).toBeTruthy();
  expect(fs.readFileSync(path.join(workspaceDir, "AGENTS.md"), "utf8")).toContain("Operate like a pragmatic CEO.");

  await page.setContent(`<main><h1>Local library sync</h1><p>${synced.stdout.replace(/[<>&]/g, "")}</p></main>`);
  await saveArtifactScreenshot(page, "library-cli-hermetic.png");
});

test("library secret requirements stay reference-only in hermetic CLI output", async ({ page }) => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-library-secrets-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const libraryDir = path.join(tempRoot, "library");
  const binPath = path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
  const baseArgs = ["--library-dir", libraryDir, "--workspace", workspaceDir, "--json"];

  await execFileAsync(process.execPath, [
    binPath, "library", "create", "namecheap",
    "--kind", "skill",
    "--ref", "namecheap",
    "--required-secret", "namecheap_api_token",
    ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [binPath, "library", "assign", "namecheap", "--agent", "ada", ...baseArgs], { cwd: rootDir });
  const resolved = await execFileAsync(process.execPath, [binPath, "library", "resolve", "--agent", "ada", ...baseArgs], { cwd: rootDir });

  expect(resolved.stdout).toContain("namecheap_api_token");
  expect(resolved.stdout).not.toContain("secret-value");

  await page.setContent("<main><h1>Library secret references</h1><p>No secret values emitted.</p></main>");
  await saveArtifactScreenshot(page, "library-cli-secrets.png");
});
