import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

import ssh2Pkg from "ssh2";
import type {
  Client as Ssh2ClientType,
  ConnectConfig,
  SFTPWrapper,
} from "ssh2";

const { Client: Ssh2Client, utils: ssh2Utils } = ssh2Pkg as unknown as {
  Client: new () => Ssh2ClientType;
  utils: typeof import("ssh2").utils;
};

type Ssh2Client = Ssh2ClientType;

import type { Host } from "@clawjs/mesh";

import {
  SshAuthError,
  SshClientError,
  SshConfigError,
  SshHostKeyError,
} from "./errors.ts";
import {
  fingerprintHostKey,
  InMemoryKnownHostsStore,
  type KnownHostRecord,
  type KnownHostsStore,
} from "./known-hosts.ts";
import type { SecretResolver, SshSecret } from "./secret-resolver.ts";

export interface SshClientOptions {
  hostResolver: HostResolver;
  secretResolver: SecretResolver;
  knownHostsStore?: KnownHostsStore;
  readyTimeoutMs?: number;
  idleEvictionMs?: number;
}

export interface HostResolver {
  resolve(hostId: string): Promise<Host | null>;
}

export interface SshExecInput {
  command: string;
  env?: Record<string, string>;
  cwd?: string;
  input?: string | Buffer;
  pty?: boolean;
  timeoutMs?: number;
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (chunk: Buffer) => void;
}

export interface SshExecResult {
  exitCode: number | null;
  signal: string | null;
  stdout: Buffer;
  stderr: Buffer;
  durationMs: number;
}

export interface SshSessionInfo {
  hostId: string;
  username: string;
  remoteHost: string;
  remotePort: number;
  hostKeyFingerprint: string;
  connectedAt: Date;
  lastUsedAt: Date;
}

export class SshClient extends EventEmitter {
  private readonly hostResolver: HostResolver;
  private readonly secretResolver: SecretResolver;
  private readonly knownHostsStore: KnownHostsStore;
  private readonly readyTimeoutMs: number;
  private readonly idleEvictionMs: number;
  private readonly sessions = new Map<string, SshSession>();

  constructor(options: SshClientOptions) {
    super();
    this.hostResolver = options.hostResolver;
    this.secretResolver = options.secretResolver;
    this.knownHostsStore = options.knownHostsStore ?? new InMemoryKnownHostsStore();
    this.readyTimeoutMs = options.readyTimeoutMs ?? 20_000;
    this.idleEvictionMs = options.idleEvictionMs ?? 5 * 60 * 1000;
  }

  async open(hostId: string): Promise<SshSession> {
    const existing = this.sessions.get(hostId);
    if (existing && !existing.closed) {
      existing.touch();
      return existing;
    }
    const host = await this.hostResolver.resolve(hostId);
    if (!host) throw new SshClientError("unknown-host", `host not found: ${hostId}`, hostId);
    if (!host.ssh) {
      throw new SshConfigError(`host ${hostId} has no ssh configuration`, hostId);
    }
    const sshEndpoint = host.endpoints.find((ep) => ep.kind === "ssh");
    if (!sshEndpoint) {
      throw new SshConfigError(`host ${hostId} has no ssh endpoint`, hostId);
    }
    const secret = await this.loadSecret(host);
    const conn = new Ssh2Client();
    const presentedFingerprintRef: { value: string | null } = { value: null };
    const knownRecord = await this.knownHostsStore.get(hostId);
    const config: ConnectConfig = {
      host: sshEndpoint.host,
      port: sshEndpoint.port,
      username: host.ssh.user,
      readyTimeout: this.readyTimeoutMs,
      hostVerifier: (key: Buffer | string, cb?: (valid: boolean) => void) => {
        const keyBuffer = typeof key === "string" ? Buffer.from(key) : key;
        const presented = fingerprintHostKey(keyBuffer);
        presentedFingerprintRef.value = presented;
        if (knownRecord && knownRecord.fingerprintSha256 !== presented) {
          cb?.(false);
          return false;
        }
        cb?.(true);
        return true;
      },
      ...buildAuth(host.ssh.authMethod, secret),
    };
    await this.connect(conn, config, hostId, knownRecord, presentedFingerprintRef);
    const fingerprint = presentedFingerprintRef.value ?? "";
    if (!knownRecord) {
      const record: KnownHostRecord = {
        hostId,
        fingerprintSha256: fingerprint,
        lastSeenAt: new Date(),
      };
      await this.knownHostsStore.put(record);
      this.emit("host-key-trusted", record);
    } else {
      await this.knownHostsStore.put({
        hostId,
        fingerprintSha256: knownRecord.fingerprintSha256,
        lastSeenAt: new Date(),
      });
    }
    const session = new SshSession({
      hostId,
      username: host.ssh.user,
      remoteHost: sshEndpoint.host,
      remotePort: sshEndpoint.port,
      hostKeyFingerprint: fingerprint,
      conn,
      onClose: () => {
        this.sessions.delete(hostId);
      },
      idleEvictionMs: this.idleEvictionMs,
    });
    this.sessions.set(hostId, session);
    return session;
  }

  async close(hostId: string): Promise<void> {
    const session = this.sessions.get(hostId);
    if (!session) return;
    await session.close();
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.sessions.values()).map((s) => s.close().catch(() => {})),
    );
  }

  listSessions(): SshSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.info());
  }

  private async loadSecret(host: Host): Promise<SshSecret | null> {
    const cfg = host.ssh!;
    if (cfg.authMethod === "agent") return null;
    const secretId = cfg.authMethod === "key" ? cfg.keySecretId : cfg.passwordSecretId;
    if (!secretId) {
      throw new SshConfigError(
        `host ${host.id} ssh.authMethod=${cfg.authMethod} requires a secret id`,
        host.id,
      );
    }
    const secret = await this.secretResolver.resolve(secretId);
    if (!secret) {
      throw new SshClientError(
        "secret-missing",
        `ssh secret not found: ${secretId}`,
        host.id,
      );
    }
    if (cfg.authMethod === "key" && secret.kind !== "private-key") {
      throw new SshConfigError(
        `host ${host.id} requires a private-key secret, got ${secret.kind}`,
        host.id,
      );
    }
    if (cfg.authMethod === "password" && secret.kind !== "password") {
      throw new SshConfigError(
        `host ${host.id} requires a password secret, got ${secret.kind}`,
        host.id,
      );
    }
    return secret;
  }

  private connect(
    conn: Ssh2Client,
    config: ConnectConfig,
    hostId: string,
    knownRecord: KnownHostRecord | null,
    presentedRef: { value: string | null },
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") {
          reject(new SshClientError("conn-refused", err.message, hostId));
          return;
        }
        if (/All configured authentication methods failed/i.test(err.message)) {
          reject(new SshAuthError(err.message, hostId));
          return;
        }
        if (
          /Host key verification failed/i.test(err.message) ||
          /Host denied/i.test(err.message) ||
          /verification failed/i.test(err.message) ||
          /Cannot continue/i.test(err.message)
        ) {
          reject(
            new SshHostKeyError(
              err.message,
              presentedRef.value ?? "",
              knownRecord?.fingerprintSha256,
              hostId,
            ),
          );
          return;
        }
        reject(new SshClientError("connect", err.message, hostId));
      };
      const cleanup = () => {
        conn.off("ready", onReady);
        conn.off("error", onError);
      };
      conn.once("ready", onReady);
      conn.once("error", onError);
      conn.connect(config);
    });
  }
}

function buildAuth(
  method: "key" | "password" | "agent",
  secret: SshSecret | null,
): Partial<ConnectConfig> {
  if (method === "key") {
    if (!secret || secret.kind !== "private-key") {
      throw new SshConfigError("missing private-key secret");
    }
    return {
      privateKey: secret.privateKeyPem,
      passphrase: secret.passphrase,
    };
  }
  if (method === "password") {
    if (!secret || secret.kind !== "password") {
      throw new SshConfigError("missing password secret");
    }
    return { password: secret.password };
  }
  if (method === "agent") {
    if (!process.env.SSH_AUTH_SOCK) {
      throw new SshConfigError("SSH_AUTH_SOCK not set, cannot use agent auth");
    }
    return { agent: process.env.SSH_AUTH_SOCK };
  }
  throw new SshConfigError(`unsupported auth method: ${method as string}`);
}

interface SshSessionInternalOptions {
  hostId: string;
  username: string;
  remoteHost: string;
  remotePort: number;
  hostKeyFingerprint: string;
  conn: Ssh2Client;
  onClose: () => void;
  idleEvictionMs: number;
}

export class SshSession {
  readonly hostId: string;
  readonly username: string;
  readonly remoteHost: string;
  readonly remotePort: number;
  readonly hostKeyFingerprint: string;
  readonly connectedAt: Date;
  private lastUsedAt: Date;
  private readonly conn: Ssh2Client;
  private readonly onClose: () => void;
  private readonly idleEvictionMs: number;
  private idleTimer: NodeJS.Timeout | null = null;
  private _closed = false;

  constructor(opts: SshSessionInternalOptions) {
    this.hostId = opts.hostId;
    this.username = opts.username;
    this.remoteHost = opts.remoteHost;
    this.remotePort = opts.remotePort;
    this.hostKeyFingerprint = opts.hostKeyFingerprint;
    this.conn = opts.conn;
    this.onClose = opts.onClose;
    this.idleEvictionMs = opts.idleEvictionMs;
    this.connectedAt = new Date();
    this.lastUsedAt = new Date();
    this.conn.on("close", () => {
      if (!this._closed) {
        this._closed = true;
        this.stopIdleTimer();
        this.onClose();
      }
    });
    this.armIdleTimer();
  }

  get closed(): boolean {
    return this._closed;
  }

  info(): SshSessionInfo {
    return {
      hostId: this.hostId,
      username: this.username,
      remoteHost: this.remoteHost,
      remotePort: this.remotePort,
      hostKeyFingerprint: this.hostKeyFingerprint,
      connectedAt: this.connectedAt,
      lastUsedAt: this.lastUsedAt,
    };
  }

  touch(): void {
    this.lastUsedAt = new Date();
    this.armIdleTimer();
  }

  async exec(input: SshExecInput): Promise<SshExecResult> {
    if (this._closed) {
      throw new SshClientError("session-closed", "session is closed", this.hostId);
    }
    this.touch();
    const start = Date.now();
    return new Promise<SshExecResult>((resolve, reject) => {
      this.conn.exec(
        input.command,
        {
          env: input.env,
          pty: input.pty ?? false,
        },
        (err, stream) => {
          if (err) {
            reject(new SshClientError("exec", err.message, this.hostId));
            return;
          }
          const stdoutChunks: Buffer[] = [];
          const stderrChunks: Buffer[] = [];
          let timeout: NodeJS.Timeout | null = null;
          let timedOut = false;
          if (input.timeoutMs && input.timeoutMs > 0) {
            timeout = setTimeout(() => {
              timedOut = true;
              try {
                stream.signal("KILL");
              } catch {
                /* ignore */
              }
              try {
                stream.close();
              } catch {
                /* ignore */
              }
            }, input.timeoutMs);
            timeout.unref?.();
          }
          stream.on("data", (chunk: Buffer) => {
            stdoutChunks.push(chunk);
            input.onStdout?.(chunk);
          });
          stream.stderr.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk);
            input.onStderr?.(chunk);
          });
          stream.on("close", (code: number | null, signal: string | null) => {
            if (timeout) clearTimeout(timeout);
            const result: SshExecResult = {
              exitCode: code,
              signal: signal,
              stdout: Buffer.concat(stdoutChunks),
              stderr: Buffer.concat(stderrChunks),
              durationMs: Date.now() - start,
            };
            if (timedOut) {
              reject(
                new SshClientError(
                  "exec-timeout",
                  `exec timed out after ${input.timeoutMs}ms`,
                  this.hostId,
                ),
              );
              return;
            }
            resolve(result);
          });
          if (input.input !== undefined) {
            stream.end(input.input);
          }
        },
      );
    });
  }

  sftp(): Promise<SftpClient> {
    if (this._closed) {
      throw new SshClientError("session-closed", "session is closed", this.hostId);
    }
    this.touch();
    return new Promise<SftpClient>((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) {
          reject(new SshClientError("sftp", err.message, this.hostId));
          return;
        }
        resolve(new SftpClient(sftp, this.hostId));
      });
    });
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    this.stopIdleTimer();
    try {
      this.conn.end();
    } catch {
      /* ignore */
    }
    await delay(20);
    this.onClose();
  }

  private armIdleTimer(): void {
    this.stopIdleTimer();
    if (this.idleEvictionMs <= 0) return;
    this.idleTimer = setTimeout(() => {
      void this.close().catch(() => {});
    }, this.idleEvictionMs);
    this.idleTimer.unref?.();
  }

  private stopIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

export class SftpClient {
  private readonly sftp: SFTPWrapper;
  private readonly hostId: string;
  constructor(sftp: SFTPWrapper, hostId: string) {
    this.sftp = sftp;
    this.hostId = hostId;
  }

  writeFile(remotePath: string, data: Buffer | string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.sftp.writeFile(remotePath, data, (err) => {
        if (err) {
          reject(new SshClientError("sftp-write", err.message, this.hostId));
          return;
        }
        resolve();
      });
    });
  }

  readFile(remotePath: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      this.sftp.readFile(remotePath, (err, data) => {
        if (err) {
          reject(new SshClientError("sftp-read", err.message, this.hostId));
          return;
        }
        resolve(data);
      });
    });
  }

  chmod(remotePath: string, mode: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.sftp.chmod(remotePath, mode, (err) => {
        if (err) {
          reject(new SshClientError("sftp-chmod", err.message, this.hostId));
          return;
        }
        resolve();
      });
    });
  }

  unlink(remotePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.sftp.unlink(remotePath, (err) => {
        if (err) {
          reject(new SshClientError("sftp-unlink", err.message, this.hostId));
          return;
        }
        resolve();
      });
    });
  }

  mkdir(remotePath: string, mode?: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cb = (err: Error | null | undefined) => {
        if (err) {
          reject(new SshClientError("sftp-mkdir", err.message, this.hostId));
          return;
        }
        resolve();
      };
      if (mode !== undefined) {
        this.sftp.mkdir(remotePath, { mode }, cb);
      } else {
        this.sftp.mkdir(remotePath, cb);
      }
    });
  }

  readdir(remotePath: string): Promise<SftpDirEntry[]> {
    return new Promise<SftpDirEntry[]>((resolve, reject) => {
      this.sftp.readdir(remotePath, (err, list) => {
        if (err) {
          reject(new SshClientError("sftp-readdir", err.message, this.hostId));
          return;
        }
        resolve(
          list.map((item) => ({
            filename: item.filename,
            longname: item.longname,
            size: Number(item.attrs.size ?? 0),
            mode: item.attrs.mode,
            mtimeMs: Number(item.attrs.mtime ?? 0) * 1000,
            isDirectory: (item.attrs.mode & 0o170000) === 0o040000,
          })),
        );
      });
    });
  }

  close(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.sftp.end();
      resolve();
    });
  }
}

export interface SftpDirEntry {
  filename: string;
  longname: string;
  size: number;
  mode: number;
  mtimeMs: number;
  isDirectory: boolean;
}

export const sshUtils = ssh2Utils;
