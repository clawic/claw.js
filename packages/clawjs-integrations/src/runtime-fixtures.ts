import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  ConnectorRuntimeFixture,
  ConnectorRuntimeFixtureKind,
} from "./runtime-registry.ts";
import type { IntegrationJson } from "./types.ts";

export interface ConnectorRuntimeLoadedFixture extends ConnectorRuntimeFixture {
  resolvedPath: string;
  body: IntegrationJson;
}

export interface LoadConnectorRuntimeFixturesOptions {
  evidenceRoot?: string;
}

export interface ConnectorRuntimeFixtureFetchOptions {
  headers?: Record<string, string>;
  status?: number;
}

interface ConnectorRuntimeRequestFixtureBody {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: IntegrationJson;
}

interface ConnectorRuntimeResponseFixtureBody {
  runtimeResponse: {
    status?: number;
    headers?: Record<string, string>;
    body?: IntegrationJson;
    bodyEncoding?: "json" | "text" | "base64";
  };
}

export function loadConnectorRuntimeFixture(
  fixture: ConnectorRuntimeFixture,
  options: LoadConnectorRuntimeFixturesOptions = {},
): ConnectorRuntimeLoadedFixture {
  const resolvedPath = resolveConnectorRuntimeFixturePath(
    options.evidenceRoot ?? process.cwd(),
    fixture.path,
  );
  if (!resolvedPath) {
    throw new Error(`Connector runtime fixture file not found: ${fixture.path}`);
  }
  return {
    ...fixture,
    resolvedPath,
    body: JSON.parse(readFileSync(resolvedPath, "utf8")) as IntegrationJson,
  };
}

export function loadConnectorRuntimeFixtures(
  fixtures: readonly ConnectorRuntimeFixture[],
  options: LoadConnectorRuntimeFixturesOptions = {},
): ConnectorRuntimeLoadedFixture[] {
  return fixtures.map((fixture) => loadConnectorRuntimeFixture(fixture, options));
}

export function createConnectorRuntimeFixtureFetch(
  fixtures: readonly ConnectorRuntimeLoadedFixture[],
  options: ConnectorRuntimeFixtureFetchOptions = {},
): typeof fetch {
  const requestFixtures = fixtures.filter((fixture) => fixture.kind === "request");
  const responseFixtures = fixtures.filter((fixture) => isResponseFixtureKind(fixture.kind));
  let nextRequest = 0;
  let nextResponse = 0;
  return (async (input, init) => {
    const requestFixture = requestFixtures[nextRequest];
    if (requestFixture) {
      await assertRequestFixture(requestFixture, input, init);
      nextRequest += 1;
    }
    const fixture = responseFixtures[nextResponse] ?? responseFixtures.at(-1);
    if (!fixture) {
      throw new Error("Connector runtime fixture fetch requires at least one response fixture");
    }
    nextResponse += 1;
    return responseFromFixture(fixture.body, options);
  }) as typeof fetch;
}

function responseFromFixture(
  body: IntegrationJson,
  options: ConnectorRuntimeFixtureFetchOptions,
): Response {
  if (!isRuntimeResponseFixtureBody(body)) {
    return Response.json(body, {
      status: options.status ?? 200,
      headers: options.headers,
    });
  }
  const fixture = body.runtimeResponse;
  const status = fixture.status ?? options.status ?? 200;
  const headers = { ...(options.headers ?? {}), ...(fixture.headers ?? {}) };
  if (fixture.bodyEncoding === "base64") {
    return new Response(bodyForStatus(status, Buffer.from(String(fixture.body ?? ""), "base64")), { status, headers });
  }
  if (fixture.bodyEncoding === "text") {
    return new Response(bodyForStatus(status, String(fixture.body ?? "")), { status, headers });
  }
  if (isNullBodyStatus(status)) return new Response(null, { status, headers });
  return Response.json(fixture.body ?? null, { status, headers });
}

async function assertRequestFixture(
  fixture: ConnectorRuntimeLoadedFixture,
  input: string | URL | Request,
  init: RequestInit | undefined,
): Promise<void> {
  const expected = fixture.body as ConnectorRuntimeRequestFixtureBody;
  const actualUrl = input instanceof Request ? input.url : String(input);
  const actualMethod = requestMethod(input, init);
  if (expected.method && actualMethod !== expected.method.toUpperCase()) {
    throw new Error(`Connector runtime request fixture method mismatch: expected ${expected.method.toUpperCase()} received ${actualMethod}`);
  }
  if (expected.url && actualUrl !== expected.url) {
    throw new Error(`Connector runtime request fixture url mismatch: expected ${expected.url} received ${actualUrl}`);
  }
  if (expected.headers) {
    const actualHeaders = requestHeaders(input, init);
    for (const [key, value] of Object.entries(expected.headers)) {
      const actual = actualHeaders.get(key);
      if (actual !== value) {
        throw new Error(`Connector runtime request fixture header mismatch for ${key}: expected ${value} received ${actual ?? "<missing>"}`);
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(expected, "body")) {
    const actualBody = await requestBody(input, init);
    if (stableJson(actualBody) !== stableJson(expected.body ?? null)) {
      throw new Error(`Connector runtime request fixture body mismatch: expected ${stableJson(expected.body ?? null)} received ${stableJson(actualBody)}`);
    }
  }
}

function requestMethod(input: string | URL | Request, init: RequestInit | undefined): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function requestHeaders(input: string | URL | Request, init: RequestInit | undefined): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

async function requestBody(input: string | URL | Request, init: RequestInit | undefined): Promise<IntegrationJson> {
  const body = init?.body;
  if (body != null) return parseFixtureBody(String(body));
  if (input instanceof Request) return parseFixtureBody(await input.clone().text());
  return null;
}

function parseFixtureBody(text: string): IntegrationJson {
  if (!text) return null;
  try {
    return JSON.parse(text) as IntegrationJson;
  } catch {
    return text;
  }
}

function stableJson(value: IntegrationJson): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: IntegrationJson): IntegrationJson {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortJson(entry)]));
  }
  return value;
}

function isRuntimeResponseFixtureBody(
  value: IntegrationJson,
): value is IntegrationJson & ConnectorRuntimeResponseFixtureBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const runtimeResponse = value.runtimeResponse;
  if (!runtimeResponse || typeof runtimeResponse !== "object" || Array.isArray(runtimeResponse)) return false;
  return (runtimeResponse.status === undefined || typeof runtimeResponse.status === "number")
    && isOptionalStringRecord(runtimeResponse.headers)
    && (runtimeResponse.bodyEncoding === undefined
      || runtimeResponse.bodyEncoding === "json"
      || runtimeResponse.bodyEncoding === "text"
      || runtimeResponse.bodyEncoding === "base64");
}

function isOptionalStringRecord(value: IntegrationJson | undefined): value is Record<string, string> | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

function bodyForStatus(status: number, body: BodyInit): BodyInit | null {
  return isNullBodyStatus(status) ? null : body;
}

function isNullBodyStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

function isResponseFixtureKind(kind: ConnectorRuntimeFixtureKind): boolean {
  return kind === "response" || kind === "source_event";
}

function resolveConnectorRuntimeFixturePath(evidenceRoot: string, fixturePath: string): string | null {
  if (path.isAbsolute(fixturePath)) return existsSync(fixturePath) ? fixturePath : null;
  let candidateRoot = evidenceRoot;
  for (;;) {
    const candidate = path.resolve(candidateRoot, fixturePath);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(candidateRoot);
    if (parent === candidateRoot) return null;
    candidateRoot = parent;
  }
}
