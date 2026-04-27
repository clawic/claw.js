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

function writeSession(workspaceDir: string, sessionId: string, messages: Array<{ role: "user" | "assistant"; text: string }>) {
  const dir = path.join(workspaceDir, ".clawjs", "sessions");
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const lines = [
    JSON.stringify({ type: "session", id: sessionId, timestamp: now, title: sessionId }),
    ...messages.map((message, index) => JSON.stringify({
      type: "message",
      id: `${sessionId}-${index}`,
      timestamp: now,
      message: { role: message.role, content: [{ type: "text", text: message.text }] },
    })),
  ];
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), `${lines.join("\n")}\n`);
}

test("commitments CLI captures explicit promises, projects reminders, records outcomes, and feeds judgment context", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-commitments-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const bin = clawBin(rootDir);
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  writeSession(workspaceDir, "commitment-session", [
    { role: "user", text: "Cuando termine la build, dime algo." },
    { role: "assistant", text: "Te aviso cuando termine la build." },
  ]);
  writeSession(workspaceDir, "trivial-session", [
    { role: "user", text: "Gracias." },
    { role: "assistant", text: "Listo." },
  ]);

  const captured = await execFileAsync(process.execPath, [
    bin, "commitments", "capture",
    "--session", "commitment-session",
    ...baseArgs,
  ], { cwd: rootDir });
  const capturedPayload = JSON.parse(captured.stdout) as { commitments: Array<{ id: string; status: string; kind: string; links: { sessions: string[] } }> };
  expect(capturedPayload.commitments).toHaveLength(1);
  expect(capturedPayload.commitments[0]?.status).toBe("active");
  expect(capturedPayload.commitments[0]?.kind).toBe("follow_up");
  expect(capturedPayload.commitments[0]?.links.sessions).toContain("commitment-session");

  const trivial = await execFileAsync(process.execPath, [
    bin, "commitments", "capture",
    "--session", "trivial-session",
    ...baseArgs,
  ], { cwd: rootDir });
  const trivialPayload = JSON.parse(trivial.stdout) as { ignored: boolean; commitments: unknown[] };
  expect(trivialPayload.ignored).toBeTruthy();
  expect(trivialPayload.commitments).toHaveLength(0);

  const remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const manual = await execFileAsync(process.execPath, [
    bin, "commitments", "add",
    "--claim", "Te aviso sobre Flutter cuando termine la build",
    "--kind", "follow_up",
    "--owner-agent", "codex",
    "--beneficiary-user", "test-user",
    "--remind-at", remindAt,
    "--due-at", remindAt,
    "--task-id", "task-build",
    ...baseArgs,
  ], { cwd: rootDir });
  const manualPayload = JSON.parse(manual.stdout) as { id: string; remindAt?: string; dueAt?: string; links: { reminders: string[]; tasks: string[] } };
  expect(manualPayload.remindAt).toBe(remindAt);
  expect(manualPayload.dueAt).toBe(remindAt);
  expect(manualPayload.links.reminders.length).toBe(1);
  expect(manualPayload.links.tasks).toContain("task-build");

  const listed = await execFileAsync(process.execPath, [
    bin, "commitments", "list",
    "--status", "active",
    ...baseArgs,
  ], { cwd: rootDir });
  const listedPayload = JSON.parse(listed.stdout) as { commitments: Array<{ id: string }> };
  expect(listedPayload.commitments.some((commitment) => commitment.id === manualPayload.id)).toBeTruthy();

  const shown = await execFileAsync(process.execPath, [
    bin, "commitments", "show", manualPayload.id,
    ...baseArgs,
  ], { cwd: rootDir });
  const shownPayload = JSON.parse(shown.stdout) as { id: string; claim: string };
  expect(shownPayload.id).toBe(manualPayload.id);
  expect(shownPayload.claim).toContain("Flutter");

  const prepared = await execFileAsync(process.execPath, [
    bin, "judgment", "prepare",
    "--question", "Debo avisar sobre Flutter",
    "--domain", "communication",
    "--impact", "medium",
    "--option", "Flutter",
    "--option", "no avisar",
    ...baseArgs,
  ], { cwd: rootDir });
  const judgmentPayload = JSON.parse(prepared.stdout) as { id: string; context: { commitments: string[] } };
  expect(judgmentPayload.context.commitments).toContain(manualPayload.id);

  const linked = await execFileAsync(process.execPath, [
    bin, "commitments", "link", capturedPayload.commitments[0]!.id,
    "--judgment", judgmentPayload.id,
    "--decision", "decision-build-followup",
    "--task", "task-build",
    ...baseArgs,
  ], { cwd: rootDir });
  const linkedPayload = JSON.parse(linked.stdout) as { links: { judgments: string[]; decisions: string[]; tasks: string[] } };
  expect(linkedPayload.links.judgments).toContain(judgmentPayload.id);
  expect(linkedPayload.links.decisions).toContain("decision-build-followup");
  expect(linkedPayload.links.tasks).toContain("task-build");

  const fulfilled = await execFileAsync(process.execPath, [
    bin, "commitments", "fulfill", manualPayload.id,
    "--outcome", "Avisado al usuario con el resultado de Flutter.",
    "--evidence-session", "commitment-session",
    "--artifact", "artifact-build-log",
    ...baseArgs,
  ], { cwd: rootDir });
  const fulfilledPayload = JSON.parse(fulfilled.stdout) as { status: string; outcome?: string; links: { artifacts: string[] } };
  expect(fulfilledPayload.status).toBe("fulfilled");
  expect(fulfilledPayload.outcome).toContain("Avisado");
  expect(fulfilledPayload.links.artifacts).toContain("artifact-build-log");

  const missed = await execFileAsync(process.execPath, [
    bin, "commitments", "miss", capturedPayload.commitments[0]!.id,
    "--reason", "No se pudo comprobar la build a tiempo.",
    "--evidence-session", "commitment-session",
    ...baseArgs,
  ], { cwd: rootDir });
  const missedPayload = JSON.parse(missed.stdout) as { status: string; missReason?: string };
  expect(missedPayload.status).toBe("missed");
  expect(missedPayload.missReason).toContain("No se pudo");

  const cancelCandidate = await execFileAsync(process.execPath, [
    bin, "commitments", "add",
    "--claim", "Me encargo de revisar el reporte temporal",
    "--kind", "promise",
    ...baseArgs,
  ], { cwd: rootDir });
  const cancelCandidatePayload = JSON.parse(cancelCandidate.stdout) as { id: string };
  const cancelled = await execFileAsync(process.execPath, [
    bin, "commitments", "cancel", cancelCandidatePayload.id,
    "--reason", "Superseded by another owner.",
    ...baseArgs,
  ], { cwd: rootDir });
  const cancelledPayload = JSON.parse(cancelled.stdout) as { status: string; cancelReason?: string };
  expect(cancelledPayload.status).toBe("cancelled");
  expect(cancelledPayload.cancelReason).toContain("Superseded");

  await page.setContent("<main><h1>Commitments CLI</h1><p>Explicit promises captured, linked, projected, fulfilled, and missed.</p></main>");
  await saveArtifactScreenshot(page, "commitments-cli.png");
});
