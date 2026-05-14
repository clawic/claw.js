// Generic command executor. Spawns a child process with secrets
// available as environment variables (or in temporary 0600 files).

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ExecutorPlugin, ExecutorOutput } from "../../types.ts";
import { redactString } from "../../redaction.ts";

interface CommandArgs {
  program: string;
  argv: string[];
  cwd?: string;
  delivery: "env" | "file" | "stdin";
  envMapping?: Record<string, string>;     // for delivery=env  (env var name → field name)
  fileMapping?: Record<string, string>;    // for delivery=file (env var holding the file path → field name)
  stdinTemplate?: string;                  // for delivery=stdin (with {{secret.field}} placeholders)
  timeoutMs?: number;
  extraEnv?: Record<string, string>;
}

const TEMPLATE = /\{\{\s*secret\.([a-zA-Z0-9_]+)\s*\}\}/g;

export const commandExecutor: ExecutorPlugin = {
  id: "command.exec",
  label: "Generic command",
  description: "Spawn a process with secrets in env, in stdin, or in 0600 files.",
  capabilities: ["broker.http"],
  async execute(ctx): Promise<ExecutorOutput> {
    const args = ctx.args as unknown as CommandArgs;
    const env: NodeJS.ProcessEnv = { ...process.env, ...(args.extraEnv ?? {}) };
    const cleanups: (() => void)[] = [];
    const secretValues: string[] = [];

    if (args.delivery === "env") {
      for (const [envName, fieldName] of Object.entries(args.envMapping ?? {})) {
        const v = ctx.resolvedFields[fieldName];
        if (v === undefined) return { ok: false, detail: `Missing field ${fieldName}` };
        env[envName] = v;
        secretValues.push(v);
      }
    } else if (args.delivery === "file") {
      const dir = mkdtempSync(path.join(tmpdir(), "clawjs-secrets-cmd-"));
      cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
      let i = 0;
      for (const [envName, fieldName] of Object.entries(args.fileMapping ?? {})) {
        const v = ctx.resolvedFields[fieldName];
        if (v === undefined) return { ok: false, detail: `Missing field ${fieldName}` };
        const file = path.join(dir, `secret_${i++}`);
        writeFileSync(file, v, { mode: 0o600 });
        env[envName] = file;
        secretValues.push(v);
      }
    }

    let stdinData: string | undefined;
    if (args.delivery === "stdin" && args.stdinTemplate) {
      stdinData = args.stdinTemplate.replace(TEMPLATE, (_m, name) => {
        const v = ctx.resolvedFields[name] ?? "";
        secretValues.push(v);
        return v;
      });
    }

    try {
      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const child = spawn(args.program, args.argv, {
          cwd: args.cwd,
          env,
          stdio: ["pipe", "pipe", "pipe"],
          signal: ctx.abortSignal,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
        child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
        child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
        child.on("error", (e) => resolve({ code: 1, stdout, stderr: stderr + (e as Error).message }));
        if (stdinData) child.stdin.end(stdinData);
        else child.stdin.end();
        if (args.timeoutMs) {
          setTimeout(() => child.kill("SIGTERM"), args.timeoutMs);
        }
      });
      return {
        ok: result.code === 0,
        status: result.code,
        body: redactString(result.stdout + result.stderr, secretValues),
      };
    } finally {
      cleanups.forEach((c) => c());
    }
  },
};
