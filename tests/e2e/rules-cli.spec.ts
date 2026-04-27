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

test("builtin ClawJS rules are visible, conditional, and locally overridable", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-rules-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const rulesDir = path.join(tempRoot, "rules");
  const baseArgs = ["--workspace", workspaceDir, "--rules-dir", rulesDir, "--json"];

  const status = await execFileAsync(process.execPath, [clawBin(rootDir), "rules", "status", ...baseArgs], { cwd: rootDir });
  const statusPayload = JSON.parse(status.stdout) as { active: number; builtin: number; local: number };
  expect(statusPayload.builtin).toBeGreaterThan(0);
  expect(statusPayload.active).toBeGreaterThanOrEqual(statusPayload.builtin);
  expect(statusPayload.local).toBe(0);

  const listed = await execFileAsync(process.execPath, [clawBin(rootDir), "rules", "list", ...baseArgs], { cwd: rootDir });
  const listedPayload = JSON.parse(listed.stdout) as { rules: Array<{ id: string; source?: string }> };
  expect(listedPayload.rules.some((rule) => rule.id === "clawjs-operating-layer" && rule.source === "builtin:clawjs-agent-rules")).toBeTruthy();

  const compiledTelegram = await execFileAsync(process.execPath, [
    clawBin(rootDir),
    "rules", "compile", "handle this Telegram Codex request",
    "--channel", "telegram",
    "--domain", "channels",
    "--agent", "telegram-codex",
    ...baseArgs,
  ], { cwd: rootDir });
  const telegramPayload = JSON.parse(compiledTelegram.stdout) as { prompt: string };
  expect(telegramPayload.prompt).toContain("ClawJS operating layer");
  expect(telegramPayload.prompt).toContain("Telegram Codex bridge");

  await execFileAsync(process.execPath, [
    clawBin(rootDir), "rules", "scopes",
    "--id", "clawjs",
    "--kind", "user",
    "--name", "global",
    ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [
    clawBin(rootDir), "rules", "propose",
    "--id", "local-secrets-override",
    "--scope", "clawjs",
    "--title", "Local secrets override",
    "--content", "Use the local test secret policy.",
    "--status", "active",
    "--key", "clawjs-secrets",
    "--priority", "0",
    ...baseArgs,
  ], { cwd: rootDir });

  const compiledSecrets = await execFileAsync(process.execPath, [
    clawBin(rootDir),
    "rules", "compile", "work with secrets",
    "--domain", "secrets",
    ...baseArgs,
  ], { cwd: rootDir });
  const secretsPayload = JSON.parse(compiledSecrets.stdout) as {
    prompt: string;
    overridden: Array<{ rule: { id: string }; overriddenBy: string }>;
  };
  expect(secretsPayload.prompt).toContain("Local secrets override");
  expect(secretsPayload.prompt).not.toContain("Secrets by reference");
  expect(secretsPayload.overridden.some((entry) => entry.rule.id === "clawjs-secrets-by-reference" && entry.overriddenBy === "local-secrets-override")).toBeTruthy();

  await page.setContent("<main><h1>Builtin ClawJS rules</h1><p>Visible, conditional, and locally overridable.</p></main>");
  await saveArtifactScreenshot(page, "rules-cli-builtins.png");
});

test("direct inference receives applicable builtin rules", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-rules-inference-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const runtimeWorkspace = path.join(tempRoot, "runtime-workspace");
  const codexHome = path.join(tempRoot, "codex-home");
  const binDir = path.join(tempRoot, "bin");
  const codexPath = path.join(binDir, "codex");
  const payloadPath = path.join(tempRoot, "codex-payloads.jsonl");
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(codexPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "--version") {
  process.stdout.write("codex-cli 0.122.0-test\\n");
  process.exit(0);
}
if (args[0] === "app-server" && args[1] === "--help") {
  process.stdout.write("Usage: codex app-server\\n");
  process.exit(0);
}
if (args[0] === "exec") {
  const prompt = args[args.length - 1] || "";
  fs.appendFileSync(${JSON.stringify(payloadPath)}, JSON.stringify({ args, prompt }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "agent_message", message: "direct inference reply" }) + "\\n");
  process.exit(0);
}
process.exit(1);
`, { mode: 0o755 });

  const result = await execFileAsync(process.execPath, [
    clawBin(rootDir),
    "inference", "generate-text",
    "--runtime", "codex",
    "--workspace", workspaceDir,
    "--runtime-workspace", runtimeWorkspace,
    "--home-dir", codexHome,
    "--transport", "cli",
    "--prompt", "Plan workspace work",
    "--domain", "workspace",
    "--json",
  ], {
    cwd: rootDir,
    env: {
      ...process.env,
      CLAWJS_CODEX_PATH: codexPath,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });

  const resultPayload = JSON.parse(result.stdout) as { text: string };
  expect(resultPayload.text).toBe("direct inference reply");
  const payloadText = fs.readFileSync(payloadPath, "utf8");
  expect(payloadText).toContain("Applicable Rules");
  expect(payloadText).toContain("ClawJS operating layer");
  expect(payloadText).toContain("Workspace productivity");

  await page.setContent("<main><h1>Direct inference rules</h1><p>Applicable builtin rules reached the Codex prompt.</p></main>");
  await saveArtifactScreenshot(page, "rules-cli-direct-inference.png");
});
