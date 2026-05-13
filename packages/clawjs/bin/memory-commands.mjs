// Memory subcommands for the Clawix CLI. HTTP client against the local
// Memory server (default 127.0.0.1:24105).

import process from "node:process";

const DEFAULT_BASE = process.env.CLAW_MEMORY_BASE ?? "http://127.0.0.1:24105";

function parseFlags(args) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out.flags[key] = true;
    } else {
      out.flags[key] = next;
      i++;
    }
  }
  return out;
}

async function fetchJson(pathname, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const editor = process.env.CLAW_MEMORY_EDITOR;
  if (editor) headers["X-Memory-Editor"] = editor;
  const res = await fetch(`${DEFAULT_BASE}${pathname}`, { ...init, headers });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, ok: res.ok, body };
}

function fmt(value) {
  return JSON.stringify(value, null, 2);
}

const HELP = `claw memory

  memory list [--type <t>] [--kind entity|memory] [--text <q>]
  memory get <noteId>
  memory search <query> [--limit <n>] [--semantic] [--scope-user <u>] [--scope-agent <a>] [--scope-project <p>]
  memory save --content <text> [--title <t>] [--class semantic|episodic|procedural|archival] [--scope-project <p>] [--tags a,b,c]
  memory update <noteId> [--title <t>] [--body <b>] [--tags a,b] [--scope-project <p>]
  memory delete <noteId> --confirm
  memory captures
  memory promote <captureId>
  memory stats
  memory doctor
  memory conclude --content <text>

Env: CLAW_MEMORY_BASE (${DEFAULT_BASE}), CLAW_MEMORY_EDITOR (user|agent|system)
`;

async function memoryList(flags) {
  const q = new URLSearchParams();
  if (flags.type) q.set("type", String(flags.type));
  if (flags.kind) q.set("noteKind", String(flags.kind));
  if (flags.text) q.set("text", String(flags.text));
  const res = await fetchJson(`/api/notes?${q.toString()}`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

async function memoryGet(args) {
  const id = args._[1];
  if (!id) { console.error("noteId required"); return 1; }
  const res = await fetchJson(`/api/notes/${encodeURIComponent(id)}`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

async function memorySearch(args) {
  const query = args._[1];
  if (!query) { console.error("query required"); return 1; }
  const q = new URLSearchParams({ q: query });
  if (args.flags.limit) q.set("limit", String(args.flags.limit));
  if (args.flags.semantic) q.set("semantic", "true");
  if (args.flags["scope-user"]) q.set("scopeUser", String(args.flags["scope-user"]));
  if (args.flags["scope-agent"]) q.set("scopeAgent", String(args.flags["scope-agent"]));
  if (args.flags["scope-project"]) q.set("scopeProject", String(args.flags["scope-project"]));
  const res = await fetchJson(`/api/search?${q.toString()}`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

async function memorySave(args) {
  const content = args.flags.content;
  if (!content || content === true) { console.error("--content required"); return 1; }
  const body = {
    content: String(content),
    title: args.flags.title ? String(args.flags.title) : undefined,
    memoryClass: args.flags.class ? String(args.flags.class) : "semantic",
    scopeUser: args.flags["scope-user"] ? String(args.flags["scope-user"]) : undefined,
    scopeAgent: args.flags["scope-agent"] ? String(args.flags["scope-agent"]) : undefined,
    scopeProject: args.flags["scope-project"] ? String(args.flags["scope-project"]) : undefined
  };
  const res = await fetchJson(`/api/tools/save`, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  // If tags provided, follow up with PATCH.
  if (args.flags.tags && res.body?.id) {
    const tags = String(args.flags.tags).split(",").map((t) => t.trim()).filter(Boolean);
    await fetchJson(`/api/notes/${encodeURIComponent(res.body.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ tags })
    });
  }
  console.log(fmt(res.body));
  return 0;
}

async function memoryUpdate(args) {
  const id = args._[1];
  if (!id) { console.error("noteId required"); return 1; }
  const patch = {};
  if (args.flags.title) patch.title = String(args.flags.title);
  if (args.flags.body) patch.body = String(args.flags.body);
  if (args.flags.tags) patch.tags = String(args.flags.tags).split(",").map((t) => t.trim()).filter(Boolean);
  if (args.flags["scope-user"]) patch.scopeUser = String(args.flags["scope-user"]);
  if (args.flags["scope-agent"]) patch.scopeAgent = String(args.flags["scope-agent"]);
  if (args.flags["scope-project"]) patch.scopeProject = String(args.flags["scope-project"]);
  const res = await fetchJson(`/api/notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

async function memoryDelete(args) {
  const id = args._[1];
  if (!id) { console.error("noteId required"); return 1; }
  if (!args.flags.confirm) { console.error("--confirm required"); return 1; }
  const res = await fetchJson(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

async function memoryCaptures() {
  const res = await fetchJson(`/api/captures`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

async function memoryPromote(args) {
  const id = args._[1];
  if (!id) { console.error("captureId required"); return 1; }
  const res = await fetchJson(`/api/promote`, { method: "POST", body: JSON.stringify({ id }) });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

async function memoryStats() {
  const res = await fetchJson(`/api/stats`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

async function memoryDoctor() {
  const res = await fetchJson(`/api/tools/status`);
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

async function memoryConclude(args) {
  const content = args.flags.content;
  if (!content || content === true) { console.error("--content required"); return 1; }
  const res = await fetchJson(`/api/tools/conclude`, {
    method: "POST",
    body: JSON.stringify({ content: String(content) })
  });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(fmt(res.body));
  return 0;
}

export async function runMemoryCli(rawArgs) {
  if (rawArgs.length === 0 || rawArgs[0] === "help" || rawArgs[0] === "--help") {
    console.log(HELP);
    return 0;
  }
  const [group, sub, ...rest] = rawArgs;
  const args = parseFlags([sub ?? "", ...rest].filter(Boolean));

  try {
    if (group !== "memory") {
      console.log(HELP);
      return 1;
    }
    switch (sub) {
      case "list": return await memoryList(args.flags);
      case "get": return await memoryGet(args);
      case "search": return await memorySearch(args);
      case "save": return await memorySave(args);
      case "update": return await memoryUpdate(args);
      case "delete": return await memoryDelete(args);
      case "captures": return await memoryCaptures();
      case "promote": return await memoryPromote(args);
      case "stats": return await memoryStats();
      case "doctor": return await memoryDoctor();
      case "conclude": return await memoryConclude(args);
      default: console.log(HELP); return 1;
    }
  } catch (err) {
    console.error("[claw memory]", err?.message ?? err);
    return 1;
  }
}

export const CLAW_MEMORY_GROUPS = new Set(["memory"]);
