// SSH executor. Hardware-backed SK keys only. Uses an isolated config to
// disable agent forwarding, ssh-agent, and arbitrary identity files.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ExecutorPlugin, ExecutorOutput } from "../../types.ts";

const ALLOWED_KEY_PREFIXES = [
  "sk-ssh-ed25519@openssh.com ",
  "sk-ecdsa-sha2-nistp256@openssh.com ",
];

interface SshConnectArgs {
  host: string;
  user: string;
  port?: number;
  command?: string;
  privateKeyPath?: string; // override; defaults to secret field
  knownHosts?: string;     // override; defaults to secret field
}

function isHardwareBacked(publicKey: string): boolean {
  return ALLOWED_KEY_PREFIXES.some((prefix) => publicKey.startsWith(prefix));
}

export const sshConnectExecutor: ExecutorPlugin = {
  id: "ssh.connect",
  label: "ssh connect",
  description: "Run an SSH command using a hardware-backed identity (Secure Enclave / YubiKey).",
  capabilities: ["broker.http"],
  validate(ctx) {
    const publicKey = ctx.resolvedFields["public_key"];
    if (!publicKey) return { ok: false, reason: "public_key field missing" };
    if (!isHardwareBacked(publicKey)) {
      return { ok: false, reason: "Only hardware-backed SK keys (sk-ssh-ed25519, sk-ecdsa) are accepted" };
    }
    return { ok: true };
  },
  async execute(ctx): Promise<ExecutorOutput> {
    const validation = this.validate?.(ctx);
    if (validation && !validation.ok) return { ok: false, detail: validation.reason };

    const args = ctx.args as SshConnectArgs;
    const privateKeyPath = args.privateKeyPath ?? ctx.resolvedFields["private_key_path"];
    if (!privateKeyPath) return { ok: false, detail: "private_key_path missing" };
    const knownHosts = args.knownHosts ?? ctx.resolvedFields["known_hosts"] ?? "";
    if (!knownHosts) return { ok: false, detail: "known_hosts entries missing for strict checking" };

    const dir = mkdtempSync(path.join(tmpdir(), "clawjs-vault-ssh-"));
    const knownHostsFile = path.join(dir, "known_hosts");
    writeFileSync(knownHostsFile, knownHosts, { mode: 0o600 });
    try {
      const argv = [
        "-F", "/dev/null",
        "-o", "IdentityAgent=none",
        "-o", "IdentitiesOnly=yes",
        "-o", "ForwardAgent=no",
        "-o", "StrictHostKeyChecking=yes",
        "-o", `UserKnownHostsFile=${knownHostsFile}`,
        "-o", `Port=${args.port ?? 22}`,
        "-i", privateKeyPath,
        `${args.user}@${args.host}`,
      ];
      if (args.command) argv.push(args.command);
      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const child = spawn("ssh", argv, {
          stdio: ["ignore", "pipe", "pipe"],
          signal: ctx.abortSignal,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
        child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
        child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
        child.on("error", (e) => resolve({ code: 1, stdout, stderr: stderr + (e as Error).message }));
      });
      return {
        ok: result.code === 0,
        status: result.code,
        body: result.stdout,
        detail: result.code === 0 ? "ssh ok" : `ssh exit ${result.code}: ${result.stderr.slice(0, 300)}`,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
