// Git executor. Runs `git push|fetch|pull|clone` with a temporary
// GIT_ASKPASS script that returns the resolved token. Disables credential
// helpers to prevent the token from being persisted by the OS keychain.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ExecutorPlugin, ExecutorOutput } from "../../types.ts";
import { redactString } from "../../redaction.ts";

interface GitArgs {
  subcommand: "push" | "fetch" | "pull" | "clone";
  cwd?: string;
  remote?: string;
  url?: string; // for clone
  branch?: string;
  extraArgs?: string[];
  username?: string;
  tokenField?: string; // defaults to "token"
}

function makeAskPass(secretValue: string): { dir: string; script: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "clawjs-secrets-git-"));
  const script = path.join(dir, "askpass.sh");
  // Print only the password (token). Username arg is matched in script.
  writeFileSync(
    script,
    `#!/bin/sh
case "$1" in
  *Username*) printf "%s" "$GIT_USERNAME" ;;
  *) printf "%s" "$GIT_PASSWORD" ;;
esac
`,
  );
  chmodSync(script, 0o700);
  return { dir, script };
}

function runGit(input: {
  argv: string[];
  cwd?: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", input.argv, {
      cwd: input.cwd,
      env: input.env,
      signal: input.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: stderr + (err as Error).message }));
  });
}

function buildBaseArgs(input: GitArgs): string[] {
  const base = [
    "-c", "credential.helper=",
    "-c", "core.askpass=", // override default askpass; we set GIT_ASKPASS env
  ];
  switch (input.subcommand) {
    case "clone":
      if (!input.url) throw new Error("git.clone requires args.url");
      return [...base, "clone", input.url, ...(input.extraArgs ?? [])];
    case "push":
      return [...base, "push", input.remote ?? "origin", ...(input.branch ? [input.branch] : []), ...(input.extraArgs ?? [])];
    case "fetch":
      return [...base, "fetch", input.remote ?? "origin", ...(input.extraArgs ?? [])];
    case "pull":
      return [...base, "pull", input.remote ?? "origin", ...(input.branch ? [input.branch] : []), ...(input.extraArgs ?? [])];
  }
}

export const gitPushExecutor: ExecutorPlugin = {
  id: "git.push",
  label: "git push",
  description: "Run `git push` injecting the token via GIT_ASKPASS, with credential helpers disabled.",
  capabilities: ["broker.http"],
  async execute(ctx): Promise<ExecutorOutput> {
    const args = ctx.args as GitArgs;
    const tokenField = args.tokenField ?? "token";
    const token = ctx.resolvedFields[tokenField];
    if (!token) return { ok: false, detail: `Missing field ${tokenField} on secret` };
    const username = args.username ?? ctx.resolvedFields["username"] ?? "x-access-token";

    const { dir, script } = makeAskPass(token);
    try {
      const argv = buildBaseArgs({ ...args, subcommand: args.subcommand ?? "push" });
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: script,
        GIT_USERNAME: username,
        GIT_PASSWORD: token,
      };
      const result = await runGit({ argv, cwd: args.cwd, env, signal: ctx.abortSignal });
      const secrets = [token];
      return {
        ok: result.code === 0,
        status: result.code,
        body: redactString(result.stdout + result.stderr, secrets),
        detail: result.code === 0 ? "git push ok" : `git exit code ${result.code}`,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const gitFetchExecutor: ExecutorPlugin = {
  ...gitPushExecutor,
  id: "git.fetch",
  label: "git fetch",
  async execute(ctx) {
    return gitPushExecutor.execute({ ...ctx, args: { ...(ctx.args as object), subcommand: "fetch" } });
  },
};

export const gitCloneExecutor: ExecutorPlugin = {
  ...gitPushExecutor,
  id: "git.clone",
  label: "git clone",
  async execute(ctx) {
    return gitPushExecutor.execute({ ...ctx, args: { ...(ctx.args as object), subcommand: "clone" } });
  },
};
