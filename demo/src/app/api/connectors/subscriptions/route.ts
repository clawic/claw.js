import fs from "node:fs";
import path from "node:path";

import {
  findConnectorOperation,
  loadConnectorCatalogFromFile,
  runConnectorSource,
  sourceSubscriptionFromPlan,
} from "@clawjs/integrations";
import type {
  ConnectorSourcePlan,
  ConnectorSourceSubscription,
  IntegrationJson,
} from "@clawjs/integrations";

import { NextRequest } from "next/server";

interface SubscriptionStore {
  subscriptions: ConnectorSourceSubscription[];
}

function catalogPath(): string {
  return process.env.CLAWJS_CONNECTOR_CATALOG_PATH
    || path.join(process.cwd(), ".clawjs", "connector-catalog.json");
}

function subscriptionsPath(): string {
  return process.env.CLAWJS_CONNECTOR_SUBSCRIPTIONS_PATH
    || path.join(process.cwd(), ".clawjs", "connector-subscriptions.json");
}

function loadCatalog() {
  try {
    return { catalog: loadConnectorCatalogFromFile(catalogPath()), error: null };
  } catch (error) {
    return { catalog: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function readStore(): SubscriptionStore {
  const filePath = subscriptionsPath();
  if (!fs.existsSync(filePath)) return { subscriptions: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<SubscriptionStore>;
    return { subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [] };
  } catch {
    return { subscriptions: [] };
  }
}

function writeStore(store: SubscriptionStore): void {
  const filePath = subscriptionsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`);
}

function upsertSubscription(subscription: ConnectorSourceSubscription): SubscriptionStore {
  const store = readStore();
  const index = store.subscriptions.findIndex((item) => item.id === subscription.id);
  if (index === -1) {
    store.subscriptions = [subscription, ...store.subscriptions];
  } else {
    store.subscriptions = [
      ...store.subscriptions.slice(0, index),
      subscription,
      ...store.subscriptions.slice(index + 1),
    ];
  }
  writeStore(store);
  return store;
}

function removeSubscription(id: string): SubscriptionStore {
  const store = readStore();
  store.subscriptions = store.subscriptions.filter((subscription) => subscription.id !== id);
  writeStore(store);
  return store;
}

function isSourcePlan(value: Awaited<ReturnType<typeof runConnectorSource>>): value is ConnectorSourcePlan {
  return value.status === "source_plan";
}

export async function GET() {
  return Response.json({
    path: subscriptionsPath(),
    subscriptions: readStore().subscriptions,
  });
}

export async function POST(req: NextRequest) {
  const { catalog, error } = loadCatalog();
  if (!catalog) {
    return Response.json({ ok: false, error, path: catalogPath() }, { status: 400 });
  }
  const body = await req.json().catch(() => ({})) as {
    operationId?: string;
    subscriptionId?: string;
    enabled?: boolean;
    values?: Record<string, IntegrationJson>;
    secretRefs?: Record<string, string>;
  };
  if (!body.operationId) {
    return Response.json({ ok: false, error: "Missing operationId" }, { status: 400 });
  }
  const found = findConnectorOperation(catalog, body.operationId);
  if (!found) {
    return Response.json({ ok: false, error: `Unknown connector operation: ${body.operationId}` }, { status: 400 });
  }
  if (found.operation.kind !== "source") {
    return Response.json({ ok: false, error: `Connector operation is not a source: ${body.operationId}` }, { status: 400 });
  }

  try {
    const plan = await runConnectorSource({
      catalog,
      operationId: body.operationId,
      input: {
        values: body.values,
        secretRefs: body.secretRefs,
      },
    });
    if (!isSourcePlan(plan)) {
      return Response.json({ ok: false, error: "Expected a source plan" }, { status: 400 });
    }
    const draft = sourceSubscriptionFromPlan(plan, {
      id: body.subscriptionId,
      enabled: body.enabled,
    });
    const existing = readStore().subscriptions.find((subscription) => subscription.id === draft.id);
    const subscription = sourceSubscriptionFromPlan(plan, {
      id: draft.id,
      enabled: body.enabled,
      existing,
    });
    const store = upsertSubscription(subscription);
    return Response.json({ ok: true, subscription, subscriptions: store.subscriptions });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const { catalog, error } = loadCatalog();
  if (!catalog) {
    return Response.json({ ok: false, error, path: catalogPath() }, { status: 400 });
  }
  const body = await req.json().catch(() => ({})) as {
    id?: string;
    enabled?: boolean;
  };
  if (!body.id) {
    return Response.json({ ok: false, error: "Missing subscription id" }, { status: 400 });
  }
  const existing = readStore().subscriptions.find((subscription) => subscription.id === body.id);
  if (!existing) {
    return Response.json({ ok: false, error: `Unknown connector subscription: ${body.id}` }, { status: 404 });
  }
  const found = findConnectorOperation(catalog, existing.operationId);
  if (!found || found.operation.kind !== "source") {
    return Response.json({ ok: false, error: `Unknown connector source: ${existing.operationId}` }, { status: 400 });
  }

  try {
    const plan = await runConnectorSource({
      catalog,
      operationId: existing.operationId,
      input: {
        values: existing.values,
        secretRefs: existing.secretRefs,
      },
    });
    if (!isSourcePlan(plan)) {
      return Response.json({ ok: false, error: "Expected a source plan" }, { status: 400 });
    }
    const subscription = sourceSubscriptionFromPlan(plan, {
      id: existing.id,
      enabled: body.enabled,
      existing,
    });
    const store = upsertSubscription(subscription);
    return Response.json({ ok: true, subscription, subscriptions: store.subscriptions });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => ({})) as { id?: string };
  const id = body.id ?? searchParams.get("id") ?? "";
  if (!id) {
    return Response.json({ ok: false, error: "Missing subscription id" }, { status: 400 });
  }
  const store = removeSubscription(id);
  return Response.json({ ok: true, subscriptions: store.subscriptions });
}
