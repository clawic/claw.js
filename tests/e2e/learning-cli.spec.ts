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

function writeSession(workspaceDir: string, sessionId: string, messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const dir = path.join(workspaceDir, ".clawjs", "sessions");
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const lines = [
    JSON.stringify({ type: "session", id: sessionId, timestamp: now, title: sessionId }),
    ...messages.map((message, index) => JSON.stringify({
      type: "message",
      id: `${sessionId}-${index}`,
      timestamp: now,
      message: {
        role: message.role,
        content: [{ type: "text", text: message.content }],
      },
    })),
  ];
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), `${lines.join("\n")}\n`);
}

test("learning CLI stores evidence, captures sessions, and promotes through owners", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-learning-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  writeSession(workspaceDir, "session-preference", [
    { role: "user", content: "No me gusta esta librería, prefiero Lucide icons para interfaces operativas." },
    { role: "assistant", content: "Usaré Lucide para los botones de esa interfaz." },
  ]);
  writeSession(workspaceDir, "session-trivial", [
    { role: "user", content: "hola" },
    { role: "assistant", content: "hola" },
  ]);

  const manual = await execFileAsync(process.execPath, [
    clawBin(rootDir), "learning", "add",
    "--claim", "Lucide icons worked well for an operational UI",
    "--target", "ui",
    "--kind", "preference",
    "--sentiment", "positive",
    "--evidence-session", "manual-session",
    ...baseArgs,
  ], { cwd: rootDir });
  const manualLearning = JSON.parse(manual.stdout) as { id: string; confidence: number; evidence: unknown[] };
  expect(manualLearning.id).toContain("lucide");
  expect(manualLearning.evidence.length).toBe(1);

  const contradicted = await execFileAsync(process.execPath, [
    clawBin(rootDir), "learning", "evidence", "add", manualLearning.id,
    "--session", "manual-session-2",
    "--sentiment", "negative",
    "--note", "Custom branded icons were preferred for this exception.",
    ...baseArgs,
  ], { cwd: rootDir });
  const contradictedLearning = JSON.parse(contradicted.stdout) as { confidence: number; evidence: unknown[] };
  expect(contradictedLearning.evidence.length).toBe(2);
  expect(contradictedLearning.confidence).toBeLessThan(manualLearning.confidence);

  const captured = await execFileAsync(process.execPath, [
    clawBin(rootDir), "learning", "capture",
    "--session", "session-preference",
    ...baseArgs,
  ], { cwd: rootDir });
  const capturedPayload = JSON.parse(captured.stdout) as { learnings: Array<{ id: string; claim: string; target: string; kind: string }> };
  expect(capturedPayload.learnings.length).toBe(1);
  expect(capturedPayload.learnings[0]?.claim).toContain("Lucide icons");
  expect(capturedPayload.learnings[0]?.target).toBe("ui");

  const trivial = await execFileAsync(process.execPath, [
    clawBin(rootDir), "learning", "capture",
    "--session", "session-trivial",
    ...baseArgs,
  ], { cwd: rootDir });
  const trivialPayload = JSON.parse(trivial.stdout) as { ignored: boolean; learnings: unknown[] };
  expect(trivialPayload.ignored).toBe(true);
  expect(trivialPayload.learnings.length).toBe(0);

  const listed = await execFileAsync(process.execPath, [
    clawBin(rootDir), "learning", "list",
    "--target", "ui",
    ...baseArgs,
  ], { cwd: rootDir });
  const listedPayload = JSON.parse(listed.stdout) as { learnings: Array<{ id: string }> };
  expect(listedPayload.learnings.length).toBe(2);

  const dryRun = await execFileAsync(process.execPath, [
    clawBin(rootDir), "learning", "promote", manualLearning.id,
    "--to", "rule",
    "--dry-run",
    ...baseArgs,
  ], { cwd: rootDir });
  const dryRunPayload = JSON.parse(dryRun.stdout) as { applied: boolean; payload: { status: string; content: string } };
  expect(dryRunPayload.applied).toBe(false);
  expect(dryRunPayload.payload.status).toBe("pending");
  expect(dryRunPayload.payload.content).toContain("Lucide icons");

  const appliedUser = await execFileAsync(process.execPath, [
    clawBin(rootDir), "learning", "promote", manualLearning.id,
    "--to", "user",
    "--apply",
    ...baseArgs,
  ], { cwd: rootDir });
  const appliedUserPayload = JSON.parse(appliedUser.stdout) as { applied: boolean; result: { status: string } };
  expect(appliedUserPayload.applied).toBe(true);
  expect(appliedUserPayload.result.status).toBe("pending");

  const inspectedUser = await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "inspect", "user", ...baseArgs,
  ], { cwd: rootDir });
  const userPayload = JSON.parse(inspectedUser.stdout) as { resolved: { proposals: Array<{ source?: string; status: string }> } };
  expect(userPayload.resolved.proposals.some((proposal) => proposal.source === `learning:${manualLearning.id}` && proposal.status === "pending")).toBeTruthy();

  await page.setContent("<main><h1>Learning CLI</h1><p>Evidence-backed learning captured and promoted as a pending user proposal.</p></main>");
  await saveArtifactScreenshot(page, "learning-cli.png");
});
