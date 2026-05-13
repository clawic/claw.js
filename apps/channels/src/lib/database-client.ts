/**
 * HTTP client for the standalone `database/` service.
 *
 * Uses the admin login (admin@database.local / database-admin) to mint a JWT
 * which is cached in-process for roughly 11h. Override by setting:
 *   CLAW_DATABASE_URL          (default: http://127.0.0.1:4510)
 *   CLAW_DATABASE_NAMESPACE    (default: main)
 *   CLAW_DATABASE_ADMIN_EMAIL  (default: admin@database.local)
 *   CLAW_DATABASE_ADMIN_PASSWORD (default: database-admin)
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:4510";
const DEFAULT_NAMESPACE = "main";
const DEFAULT_ADMIN_EMAIL = "admin@database.local";
const DEFAULT_ADMIN_PASSWORD = "database-admin";

export interface DatabaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

interface ListOptions {
  filter?: Record<string, unknown>;
  sort?: string;
  limit?: number;
  offset?: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let inflightLogin: Promise<string> | null = null;

function baseUrl(): string {
  return process.env.CLAW_DATABASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function databaseNamespace(): string {
  return process.env.CLAW_DATABASE_NAMESPACE?.trim() || DEFAULT_NAMESPACE;
}

async function login(): Promise<string> {
  if (inflightLogin) return inflightLogin;
  inflightLogin = (async () => {
    const email = process.env.CLAW_DATABASE_ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
    const password = process.env.CLAW_DATABASE_ADMIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD;
    const res = await fetch(`${baseUrl()}/v1/auth/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`database admin login failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { accessToken: string };
    cachedToken = { token: data.accessToken, expiresAt: Date.now() + 11 * 3600 * 1000 };
    return data.accessToken;
  })();
  try {
    return await inflightLogin;
  } finally {
    inflightLogin = null;
  }
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  return login();
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const doFetch = async (token: string): Promise<Response> =>
    fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let token = await getToken();
  let res = await doFetch(token);
  if (res.status === 401) {
    cachedToken = null;
    token = await getToken();
    res = await doFetch(token);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`database ${method} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function recordsPath(collection: string): string {
  return `/v1/namespaces/${databaseNamespace()}/collections/${collection}/records`;
}

export async function listRecords<T extends DatabaseRecord = DatabaseRecord>(
  collection: string,
  options: ListOptions = {},
): Promise<T[]> {
  const params = new URLSearchParams();
  if (options.filter) params.set("filter", JSON.stringify(options.filter));
  if (options.sort) params.set("sort", options.sort);
  if (typeof options.limit === "number") params.set("limit", String(options.limit));
  if (typeof options.offset === "number") params.set("offset", String(options.offset));
  if (!params.has("limit")) params.set("limit", "500");
  const url = `${recordsPath(collection)}?${params.toString()}`;
  const data = await request<{ items: T[]; total: number }>("GET", url);
  return data.items;
}

export async function getRecord<T extends DatabaseRecord = DatabaseRecord>(
  collection: string,
  id: string,
): Promise<T | null> {
  try {
    return await request<T>("GET", `${recordsPath(collection)}/${id}`);
  } catch (error) {
    if (error instanceof Error && /\b404\b/.test(error.message)) return null;
    throw error;
  }
}

export async function createRecord<T extends DatabaseRecord = DatabaseRecord>(
  collection: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return request<T>("POST", recordsPath(collection), payload);
}

export async function updateRecord<T extends DatabaseRecord = DatabaseRecord>(
  collection: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return request<T>("PATCH", `${recordsPath(collection)}/${id}`, payload);
}

export async function deleteRecord(collection: string, id: string): Promise<void> {
  await request<{ ok: boolean }>("DELETE", `${recordsPath(collection)}/${id}`);
}
