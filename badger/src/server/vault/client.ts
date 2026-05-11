// Minimal client to clawjs-vault. When BADGER_VAULT_URL is unset, we fall back
// to a local in-memory + on-disk vault so the framework remains functional in
// dev/test without standing up the real vault service. Either way, the rest of
// Badger only sees opaque `vault_ref` strings.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface VaultClient {
  put(ref: string | undefined, value: string): Promise<string>;
  get(ref: string): Promise<string | null>;
  delete(ref: string): Promise<void>;
}

export function createVaultClient(opts: {
  baseUrl: string | null;
  fallbackDir: string;
  adminToken?: string;
}): VaultClient {
  if (opts.baseUrl) {
    return new HttpVaultClient(opts.baseUrl, opts.adminToken ?? "");
  }
  return new FileVaultClient(opts.fallbackDir);
}

class FileVaultClient implements VaultClient {
  constructor(private readonly dir: string) {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private fileFor(ref: string): string {
    const safe = ref.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.dir, `${safe}.bin`);
  }

  async put(ref: string | undefined, value: string): Promise<string> {
    const id = ref ?? `vault_${crypto.randomBytes(16).toString("hex")}`;
    fs.writeFileSync(this.fileFor(id), value, { mode: 0o600 });
    return id;
  }

  async get(ref: string): Promise<string | null> {
    try {
      return fs.readFileSync(this.fileFor(ref), "utf8");
    } catch {
      return null;
    }
  }

  async delete(ref: string): Promise<void> {
    try {
      fs.unlinkSync(this.fileFor(ref));
    } catch {
      // ignore
    }
  }
}

class HttpVaultClient implements VaultClient {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  private async fetch(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put(ref: string | undefined, value: string): Promise<string> {
    const res = await this.fetch("POST", "/v1/secrets", { ref, value });
    if (!res.ok) throw new Error(`vault put failed ${res.status}`);
    const json = (await res.json()) as { ref: string };
    return json.ref;
  }

  async get(ref: string): Promise<string | null> {
    const res = await this.fetch("GET", `/v1/secrets/${encodeURIComponent(ref)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`vault get failed ${res.status}`);
    const json = (await res.json()) as { value: string };
    return json.value;
  }

  async delete(ref: string): Promise<void> {
    await this.fetch("DELETE", `/v1/secrets/${encodeURIComponent(ref)}`);
  }
}
