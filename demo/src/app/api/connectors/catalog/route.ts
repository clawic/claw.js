import path from "node:path";

import {
  findConnectorOperation,
  loadConnectorCatalogFromFile,
  runConnectorOperation,
  runConnectorSource,
  searchConnectorCatalog,
  summarizeConnectorCatalog,
} from "@clawjs/integrations";
import type { IntegrationJson } from "@clawjs/integrations";

import { NextRequest } from "next/server";

function catalogPath(): string {
  return process.env.CLAWJS_CONNECTOR_CATALOG_PATH
    || path.join(process.cwd(), ".clawjs", "connector-catalog.json");
}

function loadCatalog() {
  try {
    return { catalog: loadConnectorCatalogFromFile(catalogPath()), error: null };
  } catch (error) {
    return { catalog: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const { catalog, error } = loadCatalog();
  if (!catalog) {
    return Response.json({
      configured: false,
      path: catalogPath(),
      error,
      summary: {
        apps: 0,
        actions: 0,
        sources: 0,
        fields: 0,
        authFields: 0,
        managedFields: 0,
        defaults: 0,
        options: 0,
        annotatedOperations: 0,
        destructiveOperations: 0,
        readOnlyOperations: 0,
        openWorldOperations: 0,
        runnableOperations: 0,
        hookSources: 0,
        dedupedSources: 0,
        pollingSources: 0,
        webhookSources: 0,
        hybridSources: 0,
        statefulSources: 0,
        dynamicPropOperations: 0,
        methodOperations: 0,
      },
      apps: [],
      entries: [],
    });
  }

  const query = searchParams.get("q") ?? "";
  const kindParam = searchParams.get("kind");
  const appId = searchParams.get("appId") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? "50");
  const kind = kindParam === "action" || kindParam === "source" ? kindParam : undefined;
  const entries = searchConnectorCatalog(catalog, {
    query,
    kind,
    appId,
    limit: Number.isFinite(limit) ? limit : 50,
  }).map(({ app, operation }) => ({
    app: { id: app.id, name: app.name, description: app.description },
    operation,
  }));

  return Response.json({
    configured: true,
    path: catalogPath(),
    summary: summarizeConnectorCatalog(catalog),
    apps: catalog.apps.map((app) => ({ id: app.id, name: app.name, operations: app.operations.length })).slice(0, 500),
    entries,
  });
}

export async function POST(req: NextRequest) {
  const { catalog, error } = loadCatalog();
  if (!catalog) {
    return Response.json({ ok: false, error, path: catalogPath() }, { status: 400 });
  }
  const body = await req.json().catch(() => ({})) as {
    operationId?: string;
    values?: Record<string, IntegrationJson>;
    secretRefs?: Record<string, string>;
  };
  if (!body.operationId) {
    return Response.json({ ok: false, error: "Missing operationId" }, { status: 400 });
  }
  try {
    const found = findConnectorOperation(catalog, body.operationId);
    if (!found) {
      return Response.json({ ok: false, error: `Unknown connector operation: ${body.operationId}` }, { status: 400 });
    }
    const input = {
      values: body.values,
      secretRefs: body.secretRefs,
    };
    const preview = found.operation.kind === "source"
      ? await runConnectorSource({ catalog, operationId: body.operationId, input })
      : await runConnectorOperation({ catalog, operationId: body.operationId, input });
    return Response.json({ ok: true, preview });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 400 });
  }
}
