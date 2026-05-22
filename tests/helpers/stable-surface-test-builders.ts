import path from "node:path";

import { clawPersistentSurfaceRegistry, findClawPersistentSurfaceNode } from "@clawjs/core/catalogs";
import type { ClawPersistentSurfaceNode } from "@clawjs/core";

type RouteParams = Record<string, string | number | boolean>;
type RouteQuery = Record<string, string | number | boolean | null | undefined>;

function requireSurfaceNode(surfaceId: string): ClawPersistentSurfaceNode {
  const node = findClawPersistentSurfaceNode(surfaceId);
  if (!node) {
    throw new Error(`Unknown stable surface: ${surfaceId}`);
  }
  return node;
}

function requireRouteNode(surfaceId: string, kind: "apiRoute" | "privateApiRoute"): ClawPersistentSurfaceNode {
  const node = requireSurfaceNode(surfaceId);
  if (node.kind !== kind) {
    throw new Error(`Stable surface ${surfaceId} is ${node.kind}, expected ${kind}`);
  }
  if (!node.route) {
    throw new Error(`Stable surface ${surfaceId} does not declare a route`);
  }
  return node;
}

function fillRoute(route: string, params: RouteParams = {}): string {
  const used = new Set<string>();
  const resolved = route.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => {
    if (!(key in params)) {
      throw new Error(`Missing route parameter ${key} for ${route}`);
    }
    used.add(key);
    return encodeURIComponent(String(params[key]));
  });
  const extra = Object.keys(params).filter((key) => !used.has(key));
  if (extra.length > 0) {
    throw new Error(`Unused route parameter(s) ${extra.join(", ")} for ${route}`);
  }
  if (/\{[A-Za-z0-9_]+\}/.test(resolved)) {
    throw new Error(`Unresolved route parameter in ${resolved}`);
  }
  return resolved;
}

function appendQuery(route: string, query?: RouteQuery): string {
  if (!query) return route;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${route}?${queryString}` : route;
}

export function registeredPublicApiRoute(surfaceId: string, params?: RouteParams, query?: RouteQuery): string {
  return appendQuery(fillRoute(requireRouteNode(surfaceId, "apiRoute").route ?? "", params), query);
}

export function registeredPrivateApiRoute(surfaceId: string, params?: RouteParams, query?: RouteQuery): string {
  return appendQuery(fillRoute(requireRouteNode(surfaceId, "privateApiRoute").route ?? "", params), query);
}

export function registeredPrivateApiRouteTemplate(surfaceId: string): string {
  return requireRouteNode(surfaceId, "privateApiRoute").route ?? "";
}

export function registeredPublicApiRouteTemplate(surfaceId: string): string {
  return requireRouteNode(surfaceId, "apiRoute").route ?? "";
}

export function registeredDatabasePath(dataRoot: string, surfaceId: string): string {
  const node = requireSurfaceNode(surfaceId);
  if (node.kind !== "database" && node.kind !== "sidecar") {
    throw new Error(`Stable surface ${surfaceId} is ${node.kind}, expected database or sidecar`);
  }
  const filename = node.path?.split("/").filter(Boolean).at(-1);
  if (!filename || !filename.endsWith(".sqlite")) {
    throw new Error(`Stable surface ${surfaceId} does not resolve to a SQLite file`);
  }
  return path.join(dataRoot, filename);
}

export function registeredSearchDatabasePath(dataRoot: string): string {
  return registeredDatabasePath(dataRoot, "claw.database.search");
}

export function assertStableSurfaceRegistered(surfaceId: string): void {
  if (!clawPersistentSurfaceRegistry.nodes.some((node) => node.id === surfaceId)) {
    throw new Error(`Stable surface ${surfaceId} is not registered`);
  }
}
