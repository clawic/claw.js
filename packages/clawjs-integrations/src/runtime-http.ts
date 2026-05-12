import type {
  ConnectorRuntimeAuthBinding,
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type { IntegrationJson } from "./types.ts";

export interface ConnectorRuntimeHttpOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
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
  const response = await fetcher(request.url, request.init);
  const parsed = await parseRuntimeHttpResponse(response);
  if (!response.ok) {
    throw new ConnectorRuntimeHttpError(
      `Connector request failed: ${response.status} ${response.statusText}`,
      parsed,
    );
  }
  return parsed;
}

export function buildConnectorRuntimeFetchRequest(input: ConnectorRuntimeHttpInput): {
  url: string;
  init: RequestInit;
} {
  const method = input.plan.method.toUpperCase();
  const headers = new Headers(input.plan.headers ?? {});
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input.plan.query ?? {})) {
    appendQueryValue(query, key, value);
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
  if (Object.keys(plan.body).length === 0) return undefined;
  headers.set("content-type", headers.get("content-type") ?? "application/json");
  return JSON.stringify(plan.body);
}

function appendQueryValue(params: URLSearchParams, key: string, value: IntegrationJson): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue(params, key, item);
    return;
  }
  if (typeof value === "object") {
    params.append(key, JSON.stringify(value));
    return;
  }
  params.append(key, String(value));
}

async function parseRuntimeHttpResponse(response: Response): Promise<ConnectorRuntimeHttpResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const body = parseRuntimeHttpBody(text, contentType);
  return {
    status: response.status,
    ok: response.ok,
    headers,
    body,
  };
}

function parseRuntimeHttpBody(text: string, contentType: string): IntegrationJson {
  if (!text) return null;
  if (contentType.includes("application/json")) {
    return JSON.parse(text) as IntegrationJson;
  }
  return text;
}
