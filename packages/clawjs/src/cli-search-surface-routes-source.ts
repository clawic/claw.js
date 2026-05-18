import { listClawSurfaceRoutes, type ClawSurfaceRoute } from "@clawjs/core";
import type { SearchDocumentInput, SearchStore } from "@clawjs/search";

export function ensureSurfacesRoutesSourceIndexed(store: SearchStore): number {
  const routes = listClawSurfaceRoutes();
  for (const route of routes) {
    store.upsertDocument(surfaceRouteSearchDocument(route));
  }
  store.setCursor({
    source: "surfaces.routes",
    cursor: `routes:${routes.length}`,
    metadata: {
      registry: "surface-route-graph",
      source: "packages/clawjs-core/src/surface-registry.ts",
    },
  });
  store.setSourceState("surfaces.routes", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return routes.length;
}

export function ensureSurfaceRouteResourceIndexed(store: SearchStore, routeId: string): number {
  const route = listClawSurfaceRoutes().find((candidate) => candidate.id === routeId);
  if (!route) {
    store.tombstone({ source: "surfaces.routes", resourceId: routeId, reason: "surface route missing during Search event refresh" });
    return 1;
  }
  store.upsertDocument(surfaceRouteSearchDocument(route));
  store.setSourceState("surfaces.routes", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

function surfaceRouteSearchDocument(route: ClawSurfaceRoute): SearchDocumentInput {
  const stepLines = route.steps.map((step, index) => [
    `${index + 1}. ${step.edgeType} ${step.fromId} -> ${step.toId}`,
    step.contractId,
    step.transport,
    step.validation,
    ...(step.gaps ?? []),
  ].filter(Boolean).join(" "));
  const docs = route.docs ?? [];
  const tests = route.tests ?? [];
  const adrs = route.adrs ?? [];
  const gaps = route.gaps ?? [];
  const sourcePath = route.source?.file ?? "packages/clawjs-core/src/surface-registry.ts";
  return {
    id: `surfaces.routes:${route.id}`,
    source: "surfaces.routes",
    domain: "surfaces",
    type: "route",
    title: route.name,
    subtitle: `${route.fromId} -> ${route.toId}`,
    snippet: route.summary,
    body: [
      route.id,
      route.name,
      route.summary,
      route.transport,
      route.validation,
      route.owner,
      route.visibility,
      ...stepLines,
      ...docs,
      ...tests,
      ...adrs,
      ...gaps,
      route.notes,
    ].filter(Boolean).join("\n"),
    resourceId: route.id,
    path: sourcePath,
    metadata: {
      owner: route.owner,
      visibility: route.visibility,
      fromId: route.fromId,
      toId: route.toId,
      transport: route.transport,
      validation: route.validation,
      hasGaps: gaps.length > 0 || route.steps.some((step) => (step.gaps ?? []).length > 0),
      stepCount: route.steps.length,
      testCount: tests.length,
      docCount: docs.length,
      adrCount: adrs.length,
    },
    rankingHints: {
      route: 2,
      technical: 1,
    },
    fragments: [
      ...route.steps.map((step, index) => ({
        id: `${route.id}:step:${index + 1}`,
        title: `${step.edgeType} ${step.fromId} -> ${step.toId}`,
        body: [
          step.edgeId,
          step.contractId,
          step.owner,
          step.visibility,
          step.transport,
          step.validation,
          ...(step.gaps ?? []),
        ].filter(Boolean).join("\n"),
        snippet: step.validation ?? step.transport,
        sortOrder: index,
        metadata: {
          kind: "step",
          edgeType: step.edgeType,
          fromId: step.fromId,
          toId: step.toId,
          contractId: step.contractId,
        },
      })),
      ...(docs.length || tests.length || adrs.length ? [{
        id: `${route.id}:evidence`,
        title: "Evidence",
        body: [...docs, ...tests, ...adrs].join("\n"),
        snippet: [...docs, ...tests, ...adrs].slice(0, 3).join("; "),
        sortOrder: route.steps.length,
        metadata: { kind: "evidence" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open route source", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy route reference", requiresApproval: false },
    ],
  };
}
