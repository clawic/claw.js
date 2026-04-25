#!/usr/bin/env node

interface CliResult {
  status: number;
  output?: unknown;
  text?: string;
}

function parseFlags(argv: string[]): { args: string[]; flags: Record<string, string | boolean> } {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { args, flags };
}

function baseUrl(flags: Record<string, string | boolean>): string {
  return String(flags.url ?? process.env.DELEGATION_PLANE_URL ?? "http://127.0.0.1:4520").replace(/\/$/, "");
}

async function request(url: string, method = "GET", body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && "error" in parsed ? String((parsed as Record<string, unknown>).error) : text;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return parsed;
}

function printTree(tree: any): string {
  const children = new Map<string | null, any[]>();
  for (const node of tree.nodes as any[]) {
    const key = node.parentNodeId ?? null;
    children.set(key, [...(children.get(key) ?? []), node]);
  }
  const lines: string[] = [];
  const walk = (node: any, prefix: string) => {
    lines.push(`${prefix}${node.status} ${node.id} ${node.title}`);
    for (const child of children.get(node.id) ?? []) {
      walk(child, `${prefix}  `);
    }
  };
  const root = tree.nodes.find((node: any) => node.id === tree.graph.rootNodeId) ?? tree.nodes[0];
  if (root) walk(root, "");
  return lines.join("\n");
}

async function run(argv: string[]): Promise<CliResult> {
  const { args, flags } = parseFlags(argv);
  const url = baseUrl(flags);
  const [group, command, id] = args;

  if (group === "graph" && command === "create") {
    const objective = String(flags.objective ?? id ?? "").trim();
    if (!objective) throw new Error("Usage: delegation-plane graph create --objective TEXT [--creator NAME]");
    const output = await request(`${url}/v1/graphs`, "POST", {
      objective,
      creator: String(flags.creator ?? "operator"),
      root: {
        adapter: String(flags.adapter ?? "deterministic"),
        agentType: String(flags.agentType ?? "general"),
      },
    });
    return { status: 0, output };
  }

  if (group === "graph" && command === "list") {
    return { status: 0, output: await request(`${url}/v1/graphs`) };
  }

  if (group === "graph" && command === "inspect") {
    if (!id) throw new Error("Usage: delegation-plane graph inspect <graphId>");
    const output = await request(`${url}/v1/graphs/${id}`);
    if (flags.tree) return { status: 0, text: printTree(output) };
    return { status: 0, output };
  }

  if (group === "node" && command === "retry") {
    if (!id) throw new Error("Usage: delegation-plane node retry <nodeId>");
    return { status: 0, output: await request(`${url}/v1/nodes/${id}/retry`, "POST", {}) };
  }

  if (group === "node" && command === "cancel") {
    if (!id) throw new Error("Usage: delegation-plane node cancel <nodeId>");
    return { status: 0, output: await request(`${url}/v1/nodes/${id}/cancel`, "POST", {}) };
  }

  if (group === "worker" && command === "register") {
    const output = await request(`${url}/v1/workers/register`, "POST", {
      workerId: typeof flags.workerId === "string" ? flags.workerId : undefined,
      adapter: String(flags.adapter ?? "deterministic"),
      label: typeof flags.label === "string" ? flags.label : undefined,
      maxConcurrency: typeof flags.maxConcurrency === "string" ? Number(flags.maxConcurrency) : undefined,
    });
    return { status: 0, output };
  }

  if (group === "worker" && command === "claim") {
    if (!id) throw new Error("Usage: delegation-plane worker claim <workerId>");
    return { status: 0, output: await request(`${url}/v1/workers/${id}/claim`, "POST", {}) };
  }

  if (group === "stuck") {
    const nodes = await request(`${url}/v1/nodes`) as { nodes: any[] };
    return {
      status: 0,
      output: {
        nodes: nodes.nodes.filter((node) => node.status === "blocked" || node.status === "failed" || (node.leaseExpiresAt && node.leaseExpiresAt < Date.now())),
      },
    };
  }

  throw new Error([
    "Usage:",
    "  delegation-plane graph create --objective TEXT",
    "  delegation-plane graph list",
    "  delegation-plane graph inspect <graphId> [--tree]",
    "  delegation-plane node retry <nodeId>",
    "  delegation-plane node cancel <nodeId>",
    "  delegation-plane worker register [--workerId ID]",
    "  delegation-plane worker claim <workerId>",
    "  delegation-plane stuck",
  ].join("\n"));
}

try {
  const result = await run(process.argv.slice(2));
  if (result.text !== undefined) process.stdout.write(`${result.text}\n`);
  else process.stdout.write(`${JSON.stringify(result.output ?? {}, null, 2)}\n`);
  process.exitCode = result.status;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
