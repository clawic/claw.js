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

function writeSession(workspaceDir: string, sessionId: string, text: string) {
  const dir = path.join(workspaceDir, ".clawjs", "sessions");
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const lines = [
    JSON.stringify({ type: "session", id: sessionId, timestamp: now, title: sessionId }),
    JSON.stringify({
      type: "message",
      id: `${sessionId}-user`,
      timestamp: now,
      message: { role: "user", content: [{ type: "text", text }] },
    }),
  ];
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), `${lines.join("\n")}\n`);
}

test("judgment CLI prepares, records, links, lists, and archives decisions", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-judgment-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const bin = clawBin(rootDir);
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  writeSession(workspaceDir, "session-framework", "Necesito decidir framework para una app operativa.");

  await execFileAsync(process.execPath, [
    bin, "rules", "scopes",
    "--id", "clawjs",
    "--kind", "user",
    "--name", "global",
    ...baseArgs,
  ], { cwd: rootDir });

  const rule = await execFileAsync(process.execPath, [
    bin, "rules", "propose",
    "--scope", "clawjs",
    "--title", "Prefer Flutter for apps",
    "--content", "When deciding app framework for operational UI, use Flutter unless there is a stronger project constraint.",
    "--status", "active",
    ...baseArgs,
  ], { cwd: rootDir });
  const rulePayload = JSON.parse(rule.stdout) as { id: string };

  const preparedFromRule = await execFileAsync(process.execPath, [
    bin, "judgment", "prepare",
    "--question", "Qué framework uso para esta app operativa",
    "--domain", "architecture",
    "--impact", "medium",
    "--option", "Flutter",
    "--option", "Next.js",
    "--session", "session-framework",
    ...baseArgs,
  ], { cwd: rootDir });
  const ruleJudgment = JSON.parse(preparedFromRule.stdout) as {
    id: string;
    recommendation: string;
    recommendedOption?: string;
    context: { rules: string[]; sessions: string[] };
  };
  expect(ruleJudgment.recommendation).toBe("act");
  expect(ruleJudgment.recommendedOption).toBe("Flutter");
  expect(ruleJudgment.context.rules).toContain(rulePayload.id);
  expect(ruleJudgment.context.sessions).toContain("session-framework");

  const learning = await execFileAsync(process.execPath, [
    bin, "learning", "add",
    "--claim", "User preference: Flutter is preferred for app-like operational interfaces",
    "--target", "ui",
    "--kind", "preference",
    "--sentiment", "positive",
    "--evidence-session", "learning-session-1",
    ...baseArgs,
  ], { cwd: rootDir });
  const learningPayload = JSON.parse(learning.stdout) as { id: string };

  for (const sessionId of ["learning-session-2", "learning-session-3", "learning-session-4"]) {
    await execFileAsync(process.execPath, [
      bin, "learning", "evidence", "add", learningPayload.id,
      "--session", sessionId,
      "--sentiment", "positive",
      "--note", "Flutter preference repeated.",
      ...baseArgs,
    ], { cwd: rootDir });
  }

  const preparedFromLearning = await execFileAsync(process.execPath, [
    bin, "judgment", "prepare",
    "--question", "Qué framework uso para una interfaz app-like",
    "--domain", "architecture",
    "--impact", "medium",
    "--option", "Flutter",
    "--option", "React Native",
    ...baseArgs,
  ], { cwd: rootDir });
  const learningJudgment = JSON.parse(preparedFromLearning.stdout) as {
    id: string;
    recommendation: string;
    recommendedOption?: string;
    context: { learnings: string[] };
  };
  expect(learningJudgment.recommendation).toBe("act");
  expect(learningJudgment.recommendedOption).toBe("Flutter");
  expect(learningJudgment.context.learnings).toContain(learningPayload.id);

  const uncertain = await execFileAsync(process.execPath, [
    bin, "judgment", "prepare",
    "--question", "Qué base de datos uso para este proyecto desconocido",
    "--domain", "architecture",
    "--impact", "medium",
    "--option", "SQLite",
    "--option", "Postgres",
    ...baseArgs,
  ], { cwd: rootDir });
  const uncertainJudgment = JSON.parse(uncertain.stdout) as { recommendation: string };
  expect(uncertainJudgment.recommendation).toBe("ask_user");

  const recorded = await execFileAsync(process.execPath, [
    bin, "judgment", "record", ruleJudgment.id,
    "--chosen", "Flutter",
    "--rationale", "Rule-backed framework choice for this app shape.",
    "--confidence", "0.82",
    "--outcome", "Use Flutter as the initial framework.",
    ...baseArgs,
  ], { cwd: rootDir });
  const recordedJudgment = JSON.parse(recorded.stdout) as { status: string; chosenOption?: string; confidence: number };
  expect(recordedJudgment.status).toBe("decided");
  expect(recordedJudgment.chosenOption).toBe("Flutter");
  expect(recordedJudgment.confidence).toBe(0.82);

  const linked = await execFileAsync(process.execPath, [
    bin, "judgment", "link", ruleJudgment.id,
    "--learning", learningPayload.id,
    "--rule", rulePayload.id,
    "--session", "session-framework",
    "--decision", "decision-ui-framework",
    ...baseArgs,
  ], { cwd: rootDir });
  const linkedJudgment = JSON.parse(linked.stdout) as { context: { learnings: string[]; rules: string[]; sessions: string[]; decisions: string[] } };
  expect(linkedJudgment.context.learnings).toContain(learningPayload.id);
  expect(linkedJudgment.context.rules).toContain(rulePayload.id);
  expect(linkedJudgment.context.sessions).toContain("session-framework");
  expect(linkedJudgment.context.decisions).toContain("decision-ui-framework");

  const listed = await execFileAsync(process.execPath, [
    bin, "judgment", "list",
    "--status", "decided",
    "--domain", "architecture",
    ...baseArgs,
  ], { cwd: rootDir });
  const listedPayload = JSON.parse(listed.stdout) as { judgments: Array<{ id: string }> };
  expect(listedPayload.judgments.some((entry) => entry.id === ruleJudgment.id)).toBeTruthy();

  const shown = await execFileAsync(process.execPath, [
    bin, "judgment", "show", ruleJudgment.id,
    ...baseArgs,
  ], { cwd: rootDir });
  const shownPayload = JSON.parse(shown.stdout) as { id: string; rationale: string };
  expect(shownPayload.id).toBe(ruleJudgment.id);
  expect(shownPayload.rationale).toContain("Rule-backed");

  const archived = await execFileAsync(process.execPath, [
    bin, "judgment", "archive", learningJudgment.id,
    "--reason", "Superseded by explicit decision.",
    ...baseArgs,
  ], { cwd: rootDir });
  const archivedPayload = JSON.parse(archived.stdout) as { status: string; archiveReason?: string };
  expect(archivedPayload.status).toBe("archived");
  expect(archivedPayload.archiveReason).toBe("Superseded by explicit decision.");

  await page.setContent("<main><h1>Judgment CLI</h1><p>Prepared, recorded, linked, and archived agent decisions.</p></main>");
  await saveArtifactScreenshot(page, "judgment-cli.png");
});
