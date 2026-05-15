import { Buffer } from "node:buffer";

import type {
  ConnectorRuntimeAuthBinding,
  ConnectorRuntimeRequestPlan,
  ConnectorRuntimeQuerySerialization,
} from "./runtime-registry.ts";
import { validateConnectorRuntimeOutput } from "./runtime-output.ts";
import type { IntegrationJson } from "./types.ts";

export interface ConnectorRuntimeHttpOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ConnectorRuntimeHttpInput extends ConnectorRuntimeHttpOptions {
  plan: ConnectorRuntimeRequestPlan;
  secrets: Record<string, string>;
}

export interface ConnectorRuntimeHttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: IntegrationJson;
  rateLimit?: ConnectorRuntimeRateLimitSnapshot;
}

export interface ConnectorRuntimeRateLimitSnapshot {
  limited: boolean;
  retryAfterMs?: number;
  limit?: number;
  remaining?: number;
  resetAfterMs?: number;
  resetAt?: string;
  policy?: string;
}

export interface ConnectorRuntimeHttpPaginationResult {
  responses: ConnectorRuntimeHttpResponse[];
  items: IntegrationJson[];
}

export class ConnectorRuntimeHttpError extends Error {
  readonly response: ConnectorRuntimeHttpResponse;

  constructor(message: string, response: ConnectorRuntimeHttpResponse) {
    super(message);
    this.name = "ConnectorRuntimeHttpError";
    this.response = response;
  }
}

export async function executeConnectorRuntimeRequestPlan(
  input: ConnectorRuntimeHttpInput,
): Promise<ConnectorRuntimeHttpResponse> {
  const fetcher = input.fetchImpl ?? fetch;
  const request = buildConnectorRuntimeFetchRequest(input);
  const maxRetries = input.maxRetries ?? 0;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetcher(request.url, request.init);
    const parsed = await parseRuntimeHttpResponse(response, input.plan.responseBodyEncoding);
    if (response.ok) {
      assertRuntimeOutput(input.plan, parsed);
      return parsed;
    }
    if (attempt < maxRetries && isRetryableStatus(response.status)) {
      await (input.sleep ?? defaultSleep)(retryDelayMs(parsed, input.retryDelayMs));
      continue;
    }
    throw new ConnectorRuntimeHttpError(
      `Connector request failed: ${response.status} ${response.statusText}`,
      parsed,
    );
  }
  throw new Error("Connector request retry loop exited unexpectedly.");
}

function assertRuntimeOutput(
  plan: ConnectorRuntimeRequestPlan,
  response: ConnectorRuntimeHttpResponse,
): void {
  if (!plan.responseSchema) return;
  const errors = validateConnectorRuntimeOutput(response.body, plan.responseSchema);
  if (errors.length > 0) {
    throw new ConnectorRuntimeHttpError(
      `Connector response validation failed: ${errors.join("; ")}`,
      response,
    );
  }
}

export async function executeConnectorRuntimePaginatedRequestPlan(
  input: ConnectorRuntimeHttpInput,
): Promise<ConnectorRuntimeHttpPaginationResult> {
  const pagination = input.plan.pagination;
  if (!pagination) {
    const response = await executeConnectorRuntimeRequestPlan(input);
    return { responses: [response], items: itemsFromResponse(response.body, undefined) };
  }
  const maxPages = pagination.maxPages ?? 100;
  const responses: ConnectorRuntimeHttpResponse[] = [];
  const items: IntegrationJson[] = [];
  let nextCursor: IntegrationJson | undefined;
  let nextUrl: string | undefined;
  let offset = numberFromJson(input.plan.query?.[pagination.offsetParam ?? "offset"] ?? 0);

  for (let page = 0; page < maxPages; page += 1) {
    const plan = requestPlanForPage(input.plan, { nextCursor, nextUrl, offset });
    const response = await executeConnectorRuntimeRequestPlan({ ...input, plan });
    responses.push(response);
    const pageItems = itemsFromResponse(response.body, pagination.itemsPath);
    items.push(...pageItems);

    if (pagination.mode === "next_url") {
      nextUrl = stringFromJson(valueAtPath(response.body, pagination.nextUrlPath ?? "next"));
      if (!nextUrl) break;
      continue;
    }
    if (pagination.mode === "cursor") {
      nextCursor = valueAtPath(response.body, pagination.nextCursorPath ?? "next_cursor");
      if (nextCursor == null || nextCursor === "") break;
      continue;
    }
    const pageSize = pagination.pageSize ?? numberFromJson(input.plan.query?.[pagination.limitParam ?? "limit"]);
    if (!pageSize || pageItems.length < pageSize) break;
    offset += pageSize;
  }

  return { responses, items };
}

export function buildConnectorRuntimeFetchRequest(input: ConnectorRuntimeHttpInput): {
  url: string;
  init: RequestInit;
} {
  const method = input.plan.method.toUpperCase();
  const headers = new Headers(input.plan.headers ?? {});
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input.plan.query ?? {})) {
    appendQueryValue(query, key, value, input.plan.querySerialization?.[key]);
  }
  let endpoint = input.plan.url ?? input.plan.endpoint;
  for (const binding of input.plan.auth) {
    const secret = secretForBinding(binding, input.secrets);
    if (!binding.placement) continue;
    endpoint = applyAuthBinding({ binding, secret, headers, query, endpoint });
  }
  const url = runtimeUrl(endpoint, input.baseUrl);
  for (const [key, value] of query) url.searchParams.append(key, value);

  const init: RequestInit = { method, headers };
  const body = requestBody(input.plan, headers);
  if (body !== undefined && method !== "GET" && method !== "HEAD") init.body = body;
  return { url: url.toString(), init };
}

function requestPlanForPage(
  plan: ConnectorRuntimeRequestPlan,
  page: { nextCursor: IntegrationJson | undefined; nextUrl: string | undefined; offset: number },
): ConnectorRuntimeRequestPlan {
  const pagination = plan.pagination;
  if (!pagination) return plan;
  if (pagination.mode === "next_url" && page.nextUrl) {
    return { ...plan, url: page.nextUrl, query: {} };
  }
  const query = { ...(plan.query ?? {}) };
  if (pagination.mode === "cursor" && page.nextCursor != null && pagination.cursorParam) {
    query[pagination.cursorParam] = page.nextCursor;
  }
  if (pagination.mode === "offset" && pagination.offsetParam) {
    query[pagination.offsetParam] = page.offset;
  }
  return { ...plan, query };
}

function applyAuthBinding(input: {
  binding: ConnectorRuntimeAuthBinding;
  secret: string;
  headers: Headers;
  query: URLSearchParams;
  endpoint: string;
}): string {
  const value = input.binding.prefix ? `${input.binding.prefix}${input.secret}` : input.secret;
  switch (input.binding.placement) {
    case "bearer":
      input.headers.set("authorization", `${input.binding.prefix ?? "Bearer"} ${input.secret}`);
      return input.endpoint;
    case "header":
      input.headers.set(requiredBindingName(input.binding), value);
      return input.endpoint;
    case "query":
      input.query.set(requiredBindingName(input.binding), value);
      return input.endpoint;
    case "path": {
      const name = requiredBindingName(input.binding);
      return replacePathToken(name, value, input.endpoint);
    }
    case "cookie": {
      const cookie = `${requiredBindingName(input.binding)}=${encodeURIComponent(value)}`;
      const existing = input.headers.get("cookie");
      input.headers.set("cookie", existing ? `${existing}; ${cookie}` : cookie);
      return input.endpoint;
    }
  }
  throw new Error(`Unsupported connector runtime auth placement: ${String(input.binding.placement)}`);
}

function replacePathToken(name: string, value: string, endpoint: string): string {
  return endpoint
    .replaceAll(`{${name}}`, encodeURIComponent(value))
    .replaceAll(`:${name}`, encodeURIComponent(value));
}

function secretForBinding(binding: ConnectorRuntimeAuthBinding, secrets: Record<string, string>): string {
  const secret = secrets[binding.field];
  if (!secret) throw new Error(`Missing connector runtime secret: ${binding.field}`);
  return secret;
}

function requiredBindingName(binding: ConnectorRuntimeAuthBinding): string {
  if (binding.name?.trim()) return binding.name;
  throw new Error(`Connector runtime auth binding ${binding.field} requires a target name`);
}

function runtimeUrl(endpoint: string, baseUrl: string | undefined): URL {
  if (/^https?:\/\//i.test(endpoint)) return new URL(endpoint);
  if (!baseUrl) throw new Error("Connector runtime request plan requires baseUrl for relative endpoints");
  return new URL(endpoint.replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function requestBody(plan: ConnectorRuntimeRequestPlan, headers: Headers): BodyInit | undefined {
  if (plan.bodyEncoding === "none") return undefined;
  if (plan.bodyEncoding === "form") {
    headers.set("content-type", headers.get("content-type") ?? "application/x-www-form-urlencoded");
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(plan.body)) appendQueryValue(form, key, value);
    return form.toString();
  }
  if (plan.bodyEncoding === "multipart") {
    const form = new FormData();
    for (const [key, value] of Object.entries(plan.body)) appendFormValue(form, key, value);
    return form;
  }
  if (plan.bodyEncoding === "text") {
    headers.set("content-type", headers.get("content-type") ?? "text/plain");
    if (plan.bodyValue !== undefined) return String(plan.bodyValue);
    return String(plan.body.content ?? "");
  }
  if (plan.bodyValue !== undefined) {
    headers.set("content-type", headers.get("content-type") ?? "application/json");
    return JSON.stringify(plan.bodyValue);
  }
  if (Object.keys(plan.body).length === 0) return undefined;
  headers.set("content-type", headers.get("content-type") ?? "application/json");
  return JSON.stringify(plan.body);
}

function appendQueryValue(
  params: URLSearchParams,
  key: string,
  value: IntegrationJson,
  serialization?: ConnectorRuntimeQuerySerialization,
): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    if (serialization?.style === "spaceDelimited") {
      params.append(key, value.map(String).join(" "));
      return;
    }
    if (serialization?.style === "pipeDelimited") {
      params.append(key, value.map(String).join("|"));
      return;
    }
    if (serialization?.explode === false) {
      params.append(key, value.map(String).join(","));
      return;
    }
    for (const item of value) appendQueryValue(params, key, item);
    return;
  }
  if (typeof value === "object") {
    if (serialization?.style === "deepObject") {
      for (const [childKey, childValue] of Object.entries(value)) {
        appendQueryValue(params, `${key}[${childKey}]`, childValue);
      }
      return;
    }
    if (serialization?.style === "form" && serialization.explode === false) {
      params.append(key, Object.entries(value).map(([childKey, childValue]) => `${childKey},${String(childValue)}`).join(","));
      return;
    }
    params.append(key, JSON.stringify(value));
    return;
  }
  params.append(key, String(value));
}

function appendFormValue(form: FormData, key: string, value: IntegrationJson): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendFormValue(form, key, item);
    return;
  }
  if (typeof value === "object") {
    form.append(key, JSON.stringify(value));
    return;
  }
  form.append(key, String(value));
}

async function parseRuntimeHttpResponse(
  response: Response,
  responseBodyEncoding: ConnectorRuntimeRequestPlan["responseBodyEncoding"],
): Promise<ConnectorRuntimeHttpResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = await parseRuntimeHttpBody(response, responseBodyEncoding);
  return {
    status: response.status,
    ok: response.ok,
    headers,
    body,
    ...optionalRateLimitSnapshot(response),
  };
}

async function parseRuntimeHttpBody(
  response: Response,
  responseBodyEncoding: ConnectorRuntimeRequestPlan["responseBodyEncoding"],
): Promise<IntegrationJson> {
  if (responseBodyEncoding === "base64") {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;
    return Buffer.from(arrayBuffer).toString("base64");
  }
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!text) return null;
  if (responseBodyEncoding === "text") return text;
  if (responseBodyEncoding === "json") return JSON.parse(text) as IntegrationJson;
  if (isJsonContentType(contentType)) {
    return JSON.parse(text) as IntegrationJson;
  }
  return text;
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function retryDelayMs(response: ConnectorRuntimeHttpResponse, fallbackMs: number | undefined): number {
  if (typeof response.rateLimit?.retryAfterMs === "number") {
    return response.rateLimit.retryAfterMs;
  }
  return fallbackMs ?? 1_000;
}

function optionalRateLimitSnapshot(
  response: Response,
): { rateLimit: ConnectorRuntimeRateLimitSnapshot } | Record<string, never> {
  const snapshot = rateLimitSnapshot(response);
  return snapshot ? { rateLimit: snapshot } : {};
}

function rateLimitSnapshot(response: Response): ConnectorRuntimeRateLimitSnapshot | null {
  const retryAfter = retryAfterMs(response.headers.get("retry-after"));
  const resetAfter = resetAfterMs(response.headers);
  const resetAt = resetAtIso(response.headers, resetAfter);
  const remaining = headerNumber(response.headers, ["x-ratelimit-remaining", "ratelimit-remaining"]);
  const limit = headerNumber(response.headers, ["x-ratelimit-limit", "ratelimit-limit"]);
  const policy = headerValue(response.headers, ["ratelimit-policy"]);
  if (
    retryAfter === undefined
    && resetAfter === undefined
    && resetAt === undefined
    && remaining === undefined
    && limit === undefined
    && policy === undefined
    && response.status !== 429
  ) {
    return null;
  }
  return {
    limited: response.status === 429 || retryAfter !== undefined || remaining === 0,
    ...(retryAfter !== undefined ? { retryAfterMs: retryAfter } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
    ...(resetAfter !== undefined ? { resetAfterMs: resetAfter } : {}),
    ...(resetAt !== undefined ? { resetAt } : {}),
    ...(policy !== undefined ? { policy } : {}),
  };
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

function resetAfterMs(headers: Headers): number | undefined {
  const value = headerValue(headers, ["ratelimit-reset"]);
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1_000) : undefined;
}

function resetAtIso(headers: Headers, resetAfter: number | undefined): string | undefined {
  const absolute = headerValue(headers, ["x-ratelimit-reset"]);
  if (absolute) {
    const numeric = Number(absolute);
    if (Number.isFinite(numeric)) {
      const timestamp = numeric < 10_000_000_000 ? numeric * 1_000 : numeric;
      return new Date(timestamp).toISOString();
    }
    const timestamp = Date.parse(absolute);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return resetAfter === undefined ? undefined : new Date(Date.now() + resetAfter).toISOString();
}

function headerNumber(headers: Headers, names: readonly string[]): number | undefined {
  const value = headerValue(headers, names);
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim() ?? "";
  const number = Number(first);
  return Number.isFinite(number) ? number : undefined;
}

function headerValue(headers: Headers, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = headers.get(name);
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function valueAtPath(value: IntegrationJson, path: string | undefined): IntegrationJson | undefined {
  if (!path) return value;
  let current: IntegrationJson | undefined = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function itemsFromResponse(body: IntegrationJson, path: string | undefined): IntegrationJson[] {
  const value = valueAtPath(body, path);
  return Array.isArray(value) ? value : [];
}

function stringFromJson(value: IntegrationJson | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberFromJson(value: IntegrationJson | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
