import type { StorageObject, StorageShare } from "./types";

export type ApiError = Error & { status?: number; body?: unknown };

async function request<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (
    init.body
    && !(init.body instanceof FormData)
    && !(init.body instanceof Blob)
    && !(init.body instanceof ArrayBuffer)
    && !(init.body instanceof Uint8Array)
    && !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");
  if (!response.ok) {
    const error = new Error(
      (body as { error?: string; message?: string } | null)?.error
        || (body as { error?: string; message?: string } | null)?.message
        || `HTTP ${response.status}`,
    ) as ApiError;
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body as T;
}

export interface ListParams {
  bucket: string;
  prefix?: string;
  limit?: number;
}

export async function listObjects(
  token: string,
  params: ListParams,
): Promise<StorageObject[]> {
  const query = new URLSearchParams({ bucket: params.bucket });
  if (params.prefix) query.set("prefix", params.prefix);
  if (params.limit) query.set("limit", String(params.limit));
  const response = await request<{ items: StorageObject[] }>(
    token,
    `/v1/storage/objects?${query.toString()}`,
  );
  return response.items;
}

function objectPath(bucket: string, key: string): string {
  return `/v1/storage/objects/${encodeURIComponent(bucket)}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export interface ObjectHead {
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export async function headObject(
  token: string,
  bucket: string,
  key: string,
): Promise<ObjectHead | null> {
  const response = await fetch(objectPath(bucket, key), {
    method: "HEAD",
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`) as ApiError;
    error.status = response.status;
    throw error;
  }
  return {
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    sizeBytes: Number(response.headers.get("content-length") ?? 0),
    sha256: response.headers.get("x-storage-sha256") ?? "",
  };
}

export async function fetchObject(
  token: string,
  bucket: string,
  key: string,
): Promise<{ blob: Blob; contentType: string; sha256: string }> {
  const response = await fetch(objectPath(bucket, key), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`) as ApiError;
    error.status = response.status;
    throw error;
  }
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const sha256 = response.headers.get("x-storage-sha256") ?? "";
  const blob = await response.blob();
  return { blob, contentType, sha256 };
}

export interface PutParams {
  bucket: string;
  key: string;
  data: Blob | ArrayBuffer | Uint8Array | string;
  contentType?: string;
  visibility?: "internal" | "drive";
}

export async function putObject(
  token: string,
  params: PutParams,
): Promise<StorageObject> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": params.contentType ?? "application/octet-stream",
  };
  if (params.visibility) headers["x-storage-visibility"] = params.visibility;
  const response = await fetch(objectPath(params.bucket, params.key), {
    method: "PUT",
    headers,
    body: params.data as BodyInit,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      (json as { error?: string }).error ?? `HTTP ${response.status}`,
    ) as ApiError;
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return (json as { object: StorageObject }).object;
}

export async function deleteObject(
  token: string,
  bucket: string,
  key: string,
): Promise<boolean> {
  const response = await request<{ ok: boolean }>(token, objectPath(bucket, key), {
    method: "DELETE",
  });
  return response.ok;
}

export interface CreateShareParams {
  bucket: string;
  key: string;
  label?: string;
  expiresAt?: string | null;
  ttlMs?: number;
}

export async function createShare(
  token: string,
  params: CreateShareParams,
): Promise<StorageShare> {
  const response = await request<{ share: StorageShare }>(token, "/v1/storage/shares", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return response.share;
}

export async function revokeShare(token: string, id: string): Promise<boolean> {
  const response = await request<{ ok: boolean }>(
    token,
    `/v1/storage/shares/${encodeURIComponent(id)}/revoke`,
    { method: "POST" },
  );
  return response.ok;
}

export async function fetchOwnerToken(): Promise<string | null> {
  const response = await fetch("/v1/storage/owner-token");
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  const token = (json as { token?: string } | null)?.token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function listBuckets(token: string): Promise<string[]> {
  const response = await request<{ buckets: string[] }>(token, "/v1/storage/buckets");
  return response.buckets;
}
