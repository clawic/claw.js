// npm executor. Runs `npm publish` after verifying that the requested
// version matches an authorization. Uses an ephemeral .npmrc with the
// resolved auth token; never modifies the user's global ~/.npmrc.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ExecutorPlugin, ExecutorOutput } from "../../types.ts";
import { redactString } from "../../redaction.ts";

interface NpmPublishArgs {
  packageDir: string;
  registryUrl?: string; // defaults to https://registry.npmjs.org
  expectedVersion: string;
  expectedPackageName?: string;
  dryRun?: boolean;
  tokenField?: string;
}

interface NpmWhoamiArgs {
  registryUrl?: string;
  tokenField?: string;
}

function makeNpmrc(input: { registryUrl: string; token: string }): { dir: string; npmrc: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "clawjs-secrets-npm-"));
  const npmrc = path.join(dir, ".npmrc");
  const reg = input.registryUrl.replace(/^https?:/, "");
  writeFileSync(npmrc, `${reg}/:_authToken=${input.token}\nregistry=${input.registryUrl}\n`, { mode: 0o600 });
  return { dir, npmrc };
}

function runNpm(input: { argv: string[]; cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal }): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(process.env.NPM_BIN ?? "npm", input.argv, {
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

export const npmPublishExecutor: ExecutorPlugin = {
  id: "npm.publish",
  label: "npm publish",
  description: "Publish a package after verifying expectedVersion matches package.json.",
  capabilities: ["broker.http"],
  async execute(ctx): Promise<ExecutorOutput> {
    const args = ctx.args as NpmPublishArgs;
    const tokenField = args.tokenField ?? "token";
    const token = ctx.resolvedFields[tokenField];
    if (!token) return { ok: false, detail: `Missing field ${tokenField}` };
    if (!args.packageDir) return { ok: false, detail: "args.packageDir is required" };
    if (!args.expectedVersion) return { ok: false, detail: "args.expectedVersion is required" };

    // Verify package.json declares the expected version.
    let pkgJson: { name?: string; version?: string };
    try {
      const fs = await import("node:fs");
      const pkgPath = path.join(args.packageDir, "package.json");
      pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string; version?: string };
    } catch (e) {
      return { ok: false, detail: `cannot read package.json: ${(e as Error).message}` };
    }
    if (pkgJson.version !== args.expectedVersion) {
      return {
        ok: false,
        detail: `package.json version is ${pkgJson.version}, authorization expects ${args.expectedVersion}`,
      };
    }
    if (args.expectedPackageName && pkgJson.name !== args.expectedPackageName) {
      return {
        ok: false,
        detail: `package.json name is ${pkgJson.name}, authorization expects ${args.expectedPackageName}`,
      };
    }

    const registry = args.registryUrl ?? "https://registry.npmjs.org";
    const { dir, npmrc } = makeNpmrc({ registryUrl: registry, token });
    try {
      const argv = ["publish", "--registry", registry, "--userconfig", npmrc, ...(args.dryRun ? ["--dry-run"] : [])];
      const result = await runNpm({
        argv,
        cwd: args.packageDir,
        env: { ...process.env, NPM_CONFIG_USERCONFIG: npmrc },
        signal: ctx.abortSignal,
      });
      return {
        ok: result.code === 0,
        status: result.code,
        body: redactString(result.stdout + result.stderr, [token]),
        detail: result.code === 0 ? "npm publish ok" : `npm exit code ${result.code}`,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const npmWhoamiExecutor: ExecutorPlugin = {
  id: "npm.whoami",
  label: "npm whoami",
  description: "Verify the resolved npm token is valid.",
  capabilities: ["broker.http"],
  async execute(ctx): Promise<ExecutorOutput> {
    const args = ctx.args as NpmWhoamiArgs;
    const tokenField = args.tokenField ?? "token";
    const token = ctx.resolvedFields[tokenField];
    if (!token) return { ok: false, detail: `Missing field ${tokenField}` };
    const registry = args.registryUrl ?? "https://registry.npmjs.org";

    const res = await fetch(`${registry}/-/whoami`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: redactString(text, [token]),
    };
  },
};
