import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import type { NotebookDocument } from "../shared/types.ts";
import type { WorkerArtifactPayload, WorkerInvokePayload } from "../shared/protocol.ts";

const execFileAsync = promisify(execFile);

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function listArtifactsRecursive(root: string): WorkerArtifactPayload[] {
  if (!fs.existsSync(root)) return [];
  const walk = (current: string): WorkerArtifactPayload[] => {
    const stat = fs.statSync(current);
    const name = path.basename(current);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(current);
      const nested = entries.flatMap((entry) => walk(path.join(current, entry)));
      const hasIndexHtml = fs.existsSync(path.join(current, "index.html"));
      const hasServerJs = fs.existsSync(path.join(current, "server.js"));
      return [
        ...(hasIndexHtml || hasServerJs ? [{
          name,
          path: current,
          kind: "directory" as const,
          sizeBytes: 0,
          contentType: "application/octet-stream",
          deployableKind: hasIndexHtml ? "static" as const : "node-web" as const,
        }] : []),
        ...nested,
      ];
    }
    const deployableKind = name === "server.js" ? "node-web" : null;
    return [{
      name,
      path: current,
      kind: "file",
      sizeBytes: stat.size,
      contentType: name.endsWith(".html") ? "text/html" : name.endsWith(".json") ? "application/json" : "text/plain",
      ...(deployableKind ? { deployableKind } : {}),
    }];
  };
  return walk(root);
}

async function materializeRepository(workspaceDir: string, payload: WorkerInvokePayload): Promise<string> {
  const repoDir = path.join(workspaceDir, "repo");
  if (!fs.existsSync(repoDir)) {
    await execFileAsync("git", ["clone", payload.repository.remoteUrl, repoDir]);
  }
  await execFileAsync("git", ["-C", repoDir, "fetch", "--all"]);
  await execFileAsync("git", ["-C", repoDir, "checkout", payload.revision.baseRef]);
  const targetFile = path.join(repoDir, payload.asset.path);
  ensureDir(path.dirname(targetFile));
  fs.writeFileSync(targetFile, payload.revision.content);
  return repoDir;
}

async function runScript(repoDir: string, payload: WorkerInvokePayload, onLog: (stream: "stdout" | "stderr" | "system", line: string) => void): Promise<{ exitCode: number; outputText: string; errorText: string }> {
  const entryFile = path.join(repoDir, payload.asset.path);
  const command = payload.runtime === "python" ? "python3" : process.execPath;
  const args = [entryFile];
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd: repoDir,
      env: {
        ...process.env,
        EP_RUN_INPUT_JSON: JSON.stringify(payload.inputs),
        EP_ARTIFACT_DIR: payload.artifactDir,
      },
    });
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      text.split(/\r?\n/).filter(Boolean).forEach((line) => onLog("stdout", line));
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      text.split(/\r?\n/).filter(Boolean).forEach((line) => onLog("stderr", line));
    });
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 0,
        outputText: stdout.trim(),
        errorText: stderr.trim(),
      });
    });
  });
}

async function runNotebook(repoDir: string, payload: WorkerInvokePayload, onLog: (stream: "stdout" | "stderr" | "system", line: string) => void): Promise<{
  exitCode: number;
  outputText: string;
  errorText: string;
  snapshot: { cells: Array<{ id: string; status: "succeeded" | "failed" | "stale"; output: string }> };
}> {
  const notebook = JSON.parse(payload.revision.content) as NotebookDocument;
  const results: Array<{ id: string; status: "succeeded" | "failed" | "stale"; output: string }> = [];
  const targetIndex = payload.targetCellId ? notebook.cells.findIndex((cell) => cell.id === payload.targetCellId) : notebook.cells.length - 1;
  let cumulative = "";
  let errorText = "";
  for (let index = 0; index < notebook.cells.length; index += 1) {
    const cell = notebook.cells[index]!;
    if (payload.targetCellId && index > targetIndex) {
      results.push({ id: cell.id, status: "stale", output: "" });
      continue;
    }
    cumulative += `\n${cell.code}\n`;
    const extension = cell.runtime === "python" ? "py" : "mjs";
    const tempFile = path.join(repoDir, `.execution-cell-${index}.${extension}`);
    fs.writeFileSync(tempFile, cumulative);
    const command = cell.runtime === "python" ? "python3" : process.execPath;
    const childResult = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
      let stdout = "";
      let stderr = "";
      const child = spawn(command, [tempFile], {
        cwd: repoDir,
        env: {
          ...process.env,
          EP_RUN_INPUT_JSON: JSON.stringify(payload.inputs),
          EP_ARTIFACT_DIR: payload.artifactDir,
        },
      });
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
      });
      child.on("close", (code) => resolve({ exitCode: code ?? 0, stdout, stderr }));
    });
    if (childResult.stdout.trim()) onLog("stdout", `[${cell.id}] ${childResult.stdout.trim()}`);
    if (childResult.stderr.trim()) onLog("stderr", `[${cell.id}] ${childResult.stderr.trim()}`);
    results.push({
      id: cell.id,
      status: childResult.exitCode === 0 ? "succeeded" : "failed",
      output: [childResult.stdout.trim(), childResult.stderr.trim()].filter(Boolean).join("\n"),
    });
    if (childResult.exitCode !== 0) {
      errorText = childResult.stderr.trim();
      for (let staleIndex = index + 1; staleIndex < notebook.cells.length; staleIndex += 1) {
        results.push({ id: notebook.cells[staleIndex]!.id, status: "stale", output: "" });
      }
      return {
        exitCode: childResult.exitCode,
        outputText: results.map((result) => `${result.id}: ${result.output}`).join("\n"),
        errorText,
        snapshot: { cells: results },
      };
    }
  }
  return {
    exitCode: 0,
    outputText: results.map((result) => `${result.id}: ${result.output}`).join("\n"),
    errorText,
    snapshot: { cells: results },
  };
}

export async function executeRun(payload: WorkerInvokePayload, onLog: (stream: "stdout" | "stderr" | "system", line: string) => void): Promise<{
  exitCode: number;
  outputText: string;
  errorText: string;
  artifacts: WorkerArtifactPayload[];
  notebookSnapshot?: { cells: Array<{ id: string; status: "succeeded" | "failed" | "stale"; output: string }> };
}> {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "execution-run-"));
  ensureDir(payload.artifactDir);
  onLog("system", `materializing ${payload.repository.remoteUrl}`);
  const repoDir = await materializeRepository(workspaceDir, payload);
  if (payload.assetKind === "notebook") {
    const notebook = await runNotebook(repoDir, payload, onLog);
    return {
      exitCode: notebook.exitCode,
      outputText: notebook.outputText,
      errorText: notebook.errorText,
      artifacts: listArtifactsRecursive(payload.artifactDir),
      notebookSnapshot: notebook.snapshot,
    };
  }
  const script = await runScript(repoDir, payload, onLog);
  return {
    exitCode: script.exitCode,
    outputText: script.outputText,
    errorText: script.errorText,
    artifacts: listArtifactsRecursive(payload.artifactDir),
  };
}
