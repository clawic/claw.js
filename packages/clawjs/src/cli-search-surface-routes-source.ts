import type { ClawPersistentSurfaceNode, ClawSurfaceRoute } from "@clawjs/core";
import { clawPersistentSurfaceRegistry, listClawSurfaceRoutes } from "@clawjs/core/catalogs";
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

export function ensureSurfacesRegistrySourceIndexed(store: SearchStore): number {
  const nodes = clawPersistentSurfaceRegistry.nodes;
  for (const node of nodes) {
    store.upsertDocument(surfaceNodeSearchDocument(node));
  }
  store.setCursor({
    source: "surfaces.registry",
    cursor: `nodes:${nodes.length}`,
    metadata: {
      registry: "persistent-surface-registry",
      source: "packages/clawjs-core/src/surface-registry.ts",
    },
  });
  store.setSourceState("surfaces.registry", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return nodes.length;
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

export function ensureSurfaceRegistryResourceIndexed(store: SearchStore, surfaceId: string): number {
  const node = clawPersistentSurfaceRegistry.nodes.find((candidate) => candidate.id === surfaceId);
  if (!node) {
    store.tombstone({ source: "surfaces.registry", resourceId: surfaceId, reason: "surface node missing during Search event refresh" });
    return 1;
  }
  store.upsertDocument(surfaceNodeSearchDocument(node));
  store.setSourceState("surfaces.registry", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

function surfaceNodeSearchDocument(node: ClawPersistentSurfaceNode): SearchDocumentInput {
  const relatedRoutes = listClawSurfaceRoutes(node.id).map((route) => route.id);
  const sourcePath = node.source?.file ?? "packages/clawjs-core/src/surface-registry.ts";
  const locator = node.path ?? node.route ?? node.key ?? node.value ?? node.name;
  const agentQuestionAliases = agentQuestionAliasesForSurface(node.id);
  return {
    id: `surfaces.registry:${node.id}`,
    source: "surfaces.registry",
    domain: "surfaces",
    type: "surface",
    title: node.name,
    subtitle: `${node.id} ${node.kind}`,
    snippet: node.notes ?? locator,
    body: [
      node.id,
      node.name,
      node.kind,
      node.owner,
      node.repo,
      node.project,
      node.surfaceClass,
      node.stability,
      locator,
      node.notes,
      ...agentQuestionAliases,
      sourcePath,
      ...relatedRoutes,
      "claw inspect show",
      "claw inspect neighbors",
      "scripts/persistent-surface-guard.mjs",
      "scripts/surface-evidence-guard.mjs",
    ].filter(Boolean).join("\n"),
    resourceId: node.id,
    path: sourcePath,
    metadata: {
      surfaceSteward: node.owner,
      kind: node.kind,
      surfaceClass: node.surfaceClass,
      stability: node.stability,
      canonicality: node.canonicality,
      lifecycle: node.lifecycle,
      routeCount: relatedRoutes.length,
      hasSource: Boolean(node.source?.file),
    },
    rankingHints: {
      technical: 1,
      route: relatedRoutes.length > 0 ? 1 : 0,
    },
    fragments: [{
      id: `${node.id}:evidence`,
      title: "Evidence",
      body: [
        `declaration ${sourcePath}${node.source?.line ? `:${node.source.line}` : ""}`,
        `inspect claw inspect show ${node.id} --json`,
        `search claw search query "${node.id}" --domains surfaces --json`,
        ...agentQuestionAliases.map((query) => `agent question ${query}`),
        ...relatedRoutes.map((routeId) => `route ${routeId}`),
      ].join("\n"),
      snippet: `Inspect with claw inspect show ${node.id} --json`,
      sortOrder: 0,
      metadata: {
        kind: "evidence",
        surfaceId: node.id,
      },
    }],
  };
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
  const agentQuestionAliases = agentQuestionAliasesForRoute(route.id);
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
      ...agentQuestionAliases,
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
      routeSteward: route.owner,
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
          ...agentQuestionAliases,
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

function agentQuestionAliasesForSurface(surfaceId: string): string[] {
  const aliases: Record<string, string[]> = {
    "claw.sessions": [
      "Where is the sessions contract?",
      "Where is the session contract?",
      "sessions contract",
      "session persistence contract",
      "conversation sessions contract",
    ],
    "claw.schema.common.field.sessionId": [
      "What fields does session state expose?",
      "What field identifies a session?",
      "session state fields",
      "sessionId field",
      "framework conversation identity field",
    ],
    "claw.mac.permissionBroker": [
      "Who owns native permissions?",
      "Who owns macOS permissions?",
      "native permissions owner",
      "Mac Permission Broker owns permission lifecycle",
      "central native permission broker",
    ],
  };
  return aliases[surfaceId] ?? [];
}

function agentQuestionAliasesForRoute(routeId: string): string[] {
  const aliases: Record<string, string[]> = {
    "chat.remoteRelay": [
      "What route does Relay use for remote chat?",
      "Which route does Relay use for remote chat?",
      "Relay remote chat route",
      "remote chat through Relay",
    ],
    "sync.sessions": [
      "Which route syncs sessions?",
      "What route syncs sessions?",
      "sessions sync route",
      "sync sessions route",
    ],
  };
  return aliases[routeId] ?? [];
}
