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

function writeSession(workspaceDir: string, sessionId: string, text: string) {
  const dir = path.join(workspaceDir, ".claw", "sessions");
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), [
    JSON.stringify({ type: "session", id: sessionId, timestamp: now, title: sessionId }),
    JSON.stringify({
      type: "message",
      id: `${sessionId}-user`,
      timestamp: now,
      message: { role: "user", content: [{ type: "text", text }] },
    }),
  ].join("\n") + "\n");
}

test("context CLI prepares, budgets, archives, and links packs from judgment", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-context-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const runtimeWorkspace = path.join(tempRoot, "runtime-workspace");
  const codexHome = path.join(tempRoot, "codex-home");
  const binDir = path.join(tempRoot, "bin");
  const codexPath = path.join(binDir, "codex");
  const payloadPath = path.join(tempRoot, "codex-payloads.jsonl");
  const bin = clawBin(rootDir);
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  writeSession(workspaceDir, "session-framework", "Necesito decidir framework para una app operativa con Flutter.");

  await execFileAsync(process.execPath, [
    bin, "rules", "scopes", "--id", "clawjs", "--kind", "user", "--name", "global", ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [
    bin, "rules", "propose",
    "--scope", "clawjs",
    "--title", "Prefer Flutter for operational apps",
    "--content", "When deciding a framework for operational app UI, prefer Flutter unless project constraints say otherwise.",
    "--status", "active",
    ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [
    bin, "memory", "save",
    "Flutter has worked well for app-like operational interfaces. CONTEXT_PACK_SENTINEL",
    "--title", "Framework memory",
    "--kind", "semantic",
    "--confidence", "0.9",
    ...baseArgs,
  ], { cwd: rootDir });

  const prepared = await execFileAsync(process.execPath, [
    bin, "context", "prepare",
    "--query", "Qué framework uso para app operativa Flutter",
    "--purpose", "judgment",
    "--domain", "architecture",
    "--session", "session-framework",
    ...baseArgs,
  ], { cwd: rootDir });
  const pack = JSON.parse(prepared.stdout) as {
    id: string;
    purpose: string;
    status: string;
    sourceCounts: Record<string, number>;
    items: Array<{ source: string; snippet: string }>;
    budget: { itemCount: number; charCount: number };
  };
  expect(pack.status).toBe("active");
  expect(pack.purpose).toBe("judgment");
  expect(pack.sourceCounts.rule).toBeGreaterThanOrEqual(1);
  expect(pack.sourceCounts.memory).toBeGreaterThanOrEqual(1);
  expect(pack.sourceCounts.session).toBeGreaterThanOrEqual(1);
  expect(pack.items.some((entry) => entry.source === "memory" && entry.snippet.includes("CONTEXT_PACK_SENTINEL"))).toBeTruthy();
  expect(pack.budget.itemCount).toBe(pack.items.length);

  const budgeted = await execFileAsync(process.execPath, [
    bin, "context", "prepare",
    "--query", "Qué framework uso para app operativa Flutter",
    "--purpose", "manual",
    "--max-items", "2",
    "--max-chars", "120",
    ...baseArgs,
  ], { cwd: rootDir });
  const budgetedPack = JSON.parse(budgeted.stdout) as { items: Array<{ snippet: string }>; budget: { itemCount: number; charCount: number } };
  expect(budgetedPack.budget.itemCount).toBeLessThanOrEqual(2);
  expect(budgetedPack.budget.charCount).toBeLessThanOrEqual(120);
  expect(budgetedPack.items.reduce((sum, entry) => sum + entry.snippet.length, 0)).toBeLessThanOrEqual(120);

  const listed = await execFileAsync(process.execPath, [
    bin, "context", "list", "--purpose", "judgment", "--status", "active", ...baseArgs,
  ], { cwd: rootDir });
  const listedPayload = JSON.parse(listed.stdout) as { contexts: Array<{ id: string }> };
  expect(listedPayload.contexts.some((entry) => entry.id === pack.id)).toBeTruthy();

  const shownText = await execFileAsync(process.execPath, [
    bin, "context", "show", pack.id, "--workspace", workspaceDir,
  ], { cwd: rootDir });
  expect(shownText.stdout).toContain(pack.id);
  expect(shownText.stdout).toContain("Prepared");

  const judgment = await execFileAsync(process.execPath, [
    bin, "judgment", "prepare",
    "--question", "Qué framework uso para esta app operativa",
    "--domain", "architecture",
    "--impact", "medium",
    "--option", "Flutter",
    "--option", "Next.js",
    "--session", "session-framework",
    ...baseArgs,
  ], { cwd: rootDir });
  const judgmentPayload = JSON.parse(judgment.stdout) as { contextPackId?: string };
  expect(judgmentPayload.contextPackId).toMatch(/^context_/);

  const judgmentContext = await execFileAsync(process.execPath, [
    bin, "context", "show", judgmentPayload.contextPackId!, ...baseArgs,
  ], { cwd: rootDir });
  const judgmentContextPayload = JSON.parse(judgmentContext.stdout) as { purpose: string; sessionId?: string };
  expect(judgmentContextPayload.purpose).toBe("judgment");
  expect(judgmentContextPayload.sessionId).toBe("session-framework");

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(codexPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { process.stdout.write("codex-cli 0.122.0-test\\n"); process.exit(0); }
if (args[0] === "app-server" && args[1] === "--help") { process.stdout.write("Usage: codex app-server\\n"); process.exit(0); }
if (args[0] === "exec") {
  fs.appendFileSync(${JSON.stringify(payloadPath)}, JSON.stringify({ args, prompt: args[args.length - 1] || "" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "agent_message", message: "context inference reply" }) + "\\n");
  process.exit(0);
}
process.exit(1);
`, { mode: 0o755 });
  await execFileAsync(process.execPath, [
    bin, "inference", "generate-text",
    "--runtime", "codex",
    "--workspace", workspaceDir,
    "--runtime-workspace", runtimeWorkspace,
    "--home-dir", codexHome,
    "--transport", "cli",
    "--prompt", "Say hello",
    "--json",
  ], {
    cwd: rootDir,
    env: { ...process.env, CLAW_CODEX_PATH: codexPath, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  expect(fs.readFileSync(payloadPath, "utf8")).not.toContain("CONTEXT_PACK_SENTINEL");

  const archived = await execFileAsync(process.execPath, [
    bin, "context", "archive", pack.id, "--reason", "No longer needed.", ...baseArgs,
  ], { cwd: rootDir });
  const archivedPayload = JSON.parse(archived.stdout) as { status: string; archiveReason?: string };
  expect(archivedPayload.status).toBe("archived");
  expect(archivedPayload.archiveReason).toBe("No longer needed.");

  await page.setContent("<main><h1>Context CLI</h1><p>Prepared, budgeted, linked, and archived context packs.</p></main>");
  await saveArtifactScreenshot(page, "context-cli.png");
});
