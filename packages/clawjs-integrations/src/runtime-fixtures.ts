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
  const responseFixtures = fixtures.filter((fixture) => isResponseFixtureKind(fixture.kind));
  let nextResponse = 0;
  return (async () => {
    const fixture = responseFixtures[nextResponse] ?? responseFixtures.at(-1);
    if (!fixture) {
      throw new Error("Connector runtime fixture fetch requires at least one response fixture");
    }
    nextResponse += 1;
    return Response.json(fixture.body, {
      status: options.status ?? 200,
      headers: options.headers,
    });
  }) as typeof fetch;
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
