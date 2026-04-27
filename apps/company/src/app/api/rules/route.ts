import { createLocalRulesStore } from "@clawjs/claw";

function store() {
  return createLocalRulesStore({
    rootDir: process.env.CLAWJS_RULES_DIR,
    env: process.env,
  });
}

export async function GET() {
  const rules = store();
  return Response.json({
    status: rules.status(),
    scopes: rules.scopes(),
    rules: rules.list(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const rules = store();
  const action = String(body.action ?? "");

  if (action === "scope") {
    return Response.json(rules.upsertScope(body.scope as Parameters<typeof rules.upsertScope>[0]));
  }
  if (action === "propose") {
    return Response.json(rules.propose(body.rule as Parameters<typeof rules.propose>[0]));
  }
  if (action === "approve") {
    return Response.json(rules.approve(String(body.id ?? "")));
  }
  if (action === "archive") {
    return Response.json(rules.archive(String(body.id ?? "")));
  }
  if (action === "compile") {
    return Response.json(rules.compile(body.input as Parameters<typeof rules.compile>[0]));
  }

  return Response.json({ error: "Unsupported rules action" }, { status: 400 });
}
