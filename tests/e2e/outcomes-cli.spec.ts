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

test("outcomes CLI records calibration, captures signals, links, lists, and archives", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-outcomes-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const bin = clawBin(rootDir);
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  writeSession(workspaceDir, "session-framework", [
    { role: "user", content: "Necesito decidir framework para esta app operativa." },
  ]);
  writeSession(workspaceDir, "session-success", [
    { role: "assistant", content: "Implementé la decisión con Flutter." },
    { role: "user", content: "Perfecto, ha funcionado y la decisión de Flutter está validada." },
  ]);
  writeSession(workspaceDir, "session-trivial", [
    { role: "user", content: "hola" },
    { role: "assistant", content: "hola" },
  ]);

  const prepared = await execFileAsync(process.execPath, [
    bin, "judgment", "prepare",
    "--question", "Qué framework uso para esta app operativa",
    "--domain", "architecture",
    "--impact", "medium",
    "--option", "Flutter",
    "--option", "Next.js",
    "--session", "session-framework",
    ...baseArgs,
  ], { cwd: rootDir });
  const preparedPayload = JSON.parse(prepared.stdout) as { id: string };

  const recorded = await execFileAsync(process.execPath, [
    bin, "judgment", "record", preparedPayload.id,
    "--chosen", "Flutter",
    "--rationale", "Best fit for app-like UI.",
    "--confidence", "0.82",
    ...baseArgs,
  ], { cwd: rootDir });
  const judgment = JSON.parse(recorded.stdout) as { id: string; confidence: number };
  expect(judgment.confidence).toBe(0.82);

  const added = await execFileAsync(process.execPath, [
    bin, "outcomes", "add",
    "--subject", "Framework choice for app UI",
    "--result", "worked",
    "--score", "0.74",
    "--note", "Flutter matched the app shape but required extra setup.",
    "--judgment", judgment.id,
    "--session", "session-framework",
    ...baseArgs,
  ], { cwd: rootDir });
  const outcome = JSON.parse(added.stdout) as {
    id: string;
    expectedConfidence?: number;
    confidenceGap?: number;
    links: { judgments: string[]; sessions: string[] };
  };
  expect(outcome.links.judgments).toContain(judgment.id);
  expect(outcome.links.sessions).toContain("session-framework");
  expect(outcome.expectedConfidence).toBe(0.82);
  expect(outcome.confidenceGap).toBeCloseTo(-0.08, 2);

  const bare = await execFileAsync(process.execPath, [
    bin, "outcomes", "add",
    "--subject", "Unlinked outcome can be attached later",
    "--result", "mixed",
    "--score", "0.5",
    "--note", "Useful result but missing decision trace.",
    ...baseArgs,
  ], { cwd: rootDir });
  const bareOutcome = JSON.parse(bare.stdout) as { id: string; expectedConfidence?: number };
  expect(bareOutcome.expectedConfidence).toBeUndefined();

  const learning = await execFileAsync(process.execPath, [
    bin, "learning", "add",
    "--claim", "Flutter outcomes should be checked against decision confidence",
    "--target", "workflow",
    "--kind", "observation",
    "--evidence-session", "session-framework",
    ...baseArgs,
  ], { cwd: rootDir });
  const learningPayload = JSON.parse(learning.stdout) as { id: string };

  const linked = await execFileAsync(process.execPath, [
    bin, "outcomes", "link", bareOutcome.id,
    "--judgment", judgment.id,
    "--learning", learningPayload.id,
    "--session", "session-framework",
    "--task", "task-framework",
    "--artifact", "artifact-preview",
    ...baseArgs,
  ], { cwd: rootDir });
  const linkedOutcome = JSON.parse(linked.stdout) as {
    expectedConfidence?: number;
    confidenceGap?: number;
    links: { judgments: string[]; learnings: string[]; sessions: string[]; tasks: string[]; artifacts: string[] };
  };
  expect(linkedOutcome.links.judgments).toContain(judgment.id);
  expect(linkedOutcome.links.learnings).toContain(learningPayload.id);
  expect(linkedOutcome.links.sessions).toContain("session-framework");
  expect(linkedOutcome.links.tasks).toContain("task-framework");
  expect(linkedOutcome.links.artifacts).toContain("artifact-preview");
  expect(linkedOutcome.expectedConfidence).toBe(0.82);
  expect(linkedOutcome.confidenceGap).toBeCloseTo(-0.32, 2);

  const captured = await execFileAsync(process.execPath, [
    bin, "outcomes", "capture",
    "--session", "session-success",
    ...baseArgs,
  ], { cwd: rootDir });
  const capturedPayload = JSON.parse(captured.stdout) as { ignored: boolean; outcomes: Array<{ result: string; score: number; links: { sessions: string[] } }> };
  expect(capturedPayload.ignored).toBe(false);
  expect(capturedPayload.outcomes.length).toBe(1);
  expect(capturedPayload.outcomes[0]?.result).toBe("worked");
  expect(capturedPayload.outcomes[0]?.links.sessions).toContain("session-success");

  const trivial = await execFileAsync(process.execPath, [
    bin, "outcomes", "capture",
    "--session", "session-trivial",
    ...baseArgs,
  ], { cwd: rootDir });
  const trivialPayload = JSON.parse(trivial.stdout) as { ignored: boolean; outcomes: unknown[] };
  expect(trivialPayload.ignored).toBe(true);
  expect(trivialPayload.outcomes.length).toBe(0);

  const listed = await execFileAsync(process.execPath, [
    bin, "outcomes", "list",
    "--result", "worked",
    "--judgment", judgment.id,
    ...baseArgs,
  ], { cwd: rootDir });
  const listedPayload = JSON.parse(listed.stdout) as { outcomes: Array<{ id: string; expectedConfidence?: number; confidenceGap?: number }> };
  expect(listedPayload.outcomes.some((entry) => entry.id === outcome.id && entry.expectedConfidence === 0.82)).toBeTruthy();

  const shown = await execFileAsync(process.execPath, [
    bin, "outcomes", "show", outcome.id,
    ...baseArgs,
  ], { cwd: rootDir });
  const shownPayload = JSON.parse(shown.stdout) as { id: string; note: string; confidenceGap?: number };
  expect(shownPayload.id).toBe(outcome.id);
  expect(shownPayload.note).toContain("Flutter");
  expect(shownPayload.confidenceGap).toBeCloseTo(-0.08, 2);

  const archived = await execFileAsync(process.execPath, [
    bin, "outcomes", "archive", bareOutcome.id,
    "--reason", "Superseded by more specific outcome.",
    ...baseArgs,
  ], { cwd: rootDir });
  const archivedPayload = JSON.parse(archived.stdout) as { status: string; archiveReason?: string };
  expect(archivedPayload.status).toBe("archived");
  expect(archivedPayload.archiveReason).toBe("Superseded by more specific outcome.");

  await page.setContent("<main><h1>Outcomes CLI</h1><p>Decision outcomes are recorded with calibration, links, capture, and archive support.</p></main>");
  await saveArtifactScreenshot(page, "outcomes-cli.png");
});
