// Drive subcommands for the Clawix CLI. Implemented as a small HTTP
// client against the local Drive server (default 127.0.0.1:24104).

import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import process from "node:process";

const DEFAULT_BASE = process.env.CLAW_DRIVE_BASE ?? "http://127.0.0.1:24104";

export const CLAW_DRIVE_GROUPS = new Set(["drive"]);

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

async function fetchJson(p, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (init.body !== undefined && !(init.body instanceof FormData) && !(init.body instanceof Buffer)) {
    headers["Content-Type"] = "application/json";
  }
  if (process.env.CLAW_DRIVE_TOKEN) headers["Authorization"] = `Bearer ${process.env.CLAW_DRIVE_TOKEN}`;
  const res = await fetch(`${DEFAULT_BASE}${p}`, { ...init, headers });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, ok: res.ok, body };
}

function fmt(value) { return JSON.stringify(value, null, 2); }

const HELP = `claw drive

  drive login --email <e> --password <p>      get an admin JWT (exports as CLAW_DRIVE_TOKEN)
  drive items list [--view <v>] [--parent <id>] [--query <q>]
  drive items show <id>
  drive items move <id> --parent <id>
  drive items copy <id> [--parent <id>]
  drive items star <id>
  drive items trash <id>
  drive items restore <id>
  drive items delete <id>

  drive folders create --name <n> [--parent <id>]
  drive folders list [--parent <id>]

  drive upload <file> [--parent <id>] [--policy report]
  drive download <id> --out <path>

  drive search <query>
  drive search semantic <query> [--limit <n>]

  drive thumbnail <id> [--size 256|512] --out <path>
  drive exif <id>

  drive shares list <itemId>
  drive shares create <itemId> [--mode read|tailnet|public_tunnel|agent] [--label <l>] [--ttl <min>] [--capability <k>]
  drive shares revoke <itemId> <shareId>

  drive tokens list
  drive tokens create --label <l> --operations a,b,c
  drive tokens revoke <id>

  drive audit query [--kinds <list>] [--itemId <id>] [--limit <n>]
  drive audit verify-integrity                 (no-op for plain audit)

  drive private set <folderId>
  drive private unset <folderId>

  drive projects ensure <slug>

  drive open --port <n> --workspace <p> [--status-file <p>]
`;

async function login(args) {
  const { flags } = parseFlags(args);
  const email = flags.email ?? process.env.CLAW_DRIVE_EMAIL ?? "clawix@local";
  const password = flags.password ?? process.env.CLAW_DRIVE_PASSWORD;
  if (!password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const value = await rl.question("password: ");
    rl.close();
    return await loginWith(email, value);
  }
  return await loginWith(email, password);
}

async function loginWith(email, password) {
  const res = await fetchJson("/v1/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) { console.error(fmt(res.body)); return 1; }
  console.log(`export CLAW_DRIVE_TOKEN=${res.body.accessToken}`);
  return 0;
}

async function itemsCmd(args) {
  const sub = args[0];
  const rest = args.slice(1);
  if (sub === "list") {
    const { flags } = parseFlags(rest);
    const params = new URLSearchParams();
    if (flags.view) params.set("view", String(flags.view));
    if (flags.parent) params.set("parentId", String(flags.parent));
    if (flags.query) params.set("q", String(flags.query));
    const r = await fetchJson(`/v1/items?${params}`);
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "show") {
    const r = await fetchJson(`/v1/items/${rest[0]}`);
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "move") {
    const { flags } = parseFlags(rest.slice(1));
    const r = await fetchJson(`/v1/items/${rest[0]}/move`, {
      method: "POST",
      body: JSON.stringify({ parentId: flags.parent ?? null }),
    });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "copy") {
    const { flags } = parseFlags(rest.slice(1));
    const r = await fetchJson(`/v1/items/${rest[0]}/copy`, {
      method: "POST",
      body: JSON.stringify({ parentId: flags.parent ?? null }),
    });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "star") {
    const r = await fetchJson(`/v1/items/${rest[0]}`, {
      method: "PATCH",
      body: JSON.stringify({ starred: true }),
    });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "trash") {
    const r = await fetchJson(`/v1/items/${rest[0]}/trash`, { method: "POST" });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "restore") {
    const r = await fetchJson(`/v1/items/${rest[0]}/restore`, { method: "POST" });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "delete") {
    const r = await fetchJson(`/v1/items/${rest[0]}`, { method: "DELETE" });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  console.error(HELP);
  return 1;
}

async function foldersCmd(args) {
  const sub = args[0];
  if (sub === "create") {
    const { flags } = parseFlags(args.slice(1));
    const r = await fetchJson("/v1/items", {
      method: "POST",
      body: JSON.stringify({ kind: "folder", name: flags.name ?? "Untitled folder", parentId: flags.parent ?? null }),
    });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "list") {
    const { flags } = parseFlags(args.slice(1));
    const params = new URLSearchParams({ view: "my-drive" });
    if (flags.parent) params.set("parentId", String(flags.parent));
    const r = await fetchJson(`/v1/items?${params}`);
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  console.error(HELP);
  return 1;
}

async function uploadCmd(args) {
  const { _: positional, flags } = parseFlags(args);
  const filePath = positional[0];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error("file not found:", filePath);
    return 1;
  }
  const buffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const fd = new FormData();
  fd.append("file", new Blob([buffer]), fileName);
  if (flags.parent) fd.append("parentId", String(flags.parent));
  const url = `/v1/uploads${flags.policy ? `?duplicatePolicy=${encodeURIComponent(String(flags.policy))}` : ""}`;
  const r = await fetchJson(url, { method: "POST", body: fd });
  console.log(fmt(r.body));
  return r.ok ? 0 : 1;
}

async function downloadCmd(args) {
  const { _: positional, flags } = parseFlags(args);
  const id = positional[0];
  const out = flags.out ?? `${id}.bin`;
  const headers = {};
  if (process.env.CLAW_DRIVE_TOKEN) headers["Authorization"] = `Bearer ${process.env.CLAW_DRIVE_TOKEN}`;
  const res = await fetch(`${DEFAULT_BASE}/v1/items/${id}/download`, { headers });
  if (!res.ok) { console.error("status", res.status); return 1; }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log("wrote", out);
  return 0;
}

async function searchCmd(args) {
  const sub = args[0];
  if (sub === "semantic") {
    const { _: positional, flags } = parseFlags(args.slice(1));
    const r = await fetchJson("/v1/search/semantic", {
      method: "POST",
      body: JSON.stringify({ query: positional.join(" "), limit: Number(flags.limit ?? 20) }),
    });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  const { _: positional } = parseFlags(args);
  const r = await fetchJson(`/v1/search?q=${encodeURIComponent(positional.join(" "))}`);
  console.log(fmt(r.body));
  return r.ok ? 0 : 1;
}

async function thumbnailCmd(args) {
  const { _: positional, flags } = parseFlags(args);
  const id = positional[0];
  const out = flags.out ?? `${id}-thumb.jpg`;
  const sz = flags.size === "512" ? 512 : 256;
  const headers = {};
  if (process.env.CLAW_DRIVE_TOKEN) headers["Authorization"] = `Bearer ${process.env.CLAW_DRIVE_TOKEN}`;
  const res = await fetch(`${DEFAULT_BASE}/v1/items/${id}/thumbnail?size=${sz}`, { headers });
  if (!res.ok) { console.error("status", res.status); return 1; }
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log("wrote", out);
  return 0;
}

async function exifCmd(args) {
  const r = await fetchJson(`/v1/items/${args[0]}/exif`);
  console.log(fmt(r.body));
  return r.ok ? 0 : 1;
}

async function sharesCmd(args) {
  const sub = args[0];
  if (sub === "list") {
    const r = await fetchJson(`/v1/items/${args[1]}/shares/all`);
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "create") {
    const itemId = args[1];
    const { flags } = parseFlags(args.slice(2));
    const body = {
      mode: flags.mode ?? "read",
      label: flags.label ?? "Share link",
      capabilityKind: flags.capability ?? "drive.item.read",
      ttlMinutes: flags.ttl ? Number(flags.ttl) : 10,
      reason: flags.reason ?? null,
      agentName: flags.agent ?? "agent",
    };
    const r = await fetchJson(`/v1/items/${itemId}/shares`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "revoke") {
    const r = await fetchJson(`/v1/items/${args[1]}/shares/${args[2]}/revoke`, { method: "POST" });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  console.error(HELP);
  return 1;
}

async function tokensCmd(args) {
  const sub = args[0];
  if (sub === "list") {
    const r = await fetchJson("/v1/tokens");
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "create") {
    const { flags } = parseFlags(args.slice(1));
    const operations = String(flags.operations ?? "items:read").split(",").map((s) => s.trim());
    const r = await fetchJson("/v1/tokens", {
      method: "POST",
      body: JSON.stringify({ label: flags.label ?? "Agent token", operations }),
    });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "revoke") {
    const r = await fetchJson(`/v1/tokens/${args[1]}/revoke`, { method: "POST" });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  console.error(HELP);
  return 1;
}

async function auditCmd(args) {
  const sub = args[0];
  if (sub === "query") {
    const { flags } = parseFlags(args.slice(1));
    const params = new URLSearchParams();
    if (flags.kinds) params.set("kinds", String(flags.kinds));
    if (flags.itemId) params.set("itemId", String(flags.itemId));
    if (flags.limit) params.set("limit", String(flags.limit));
    const r = await fetchJson(`/v1/audit?${params}`);
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "verify-integrity") {
    console.log(fmt({ ok: true, mode: "plain", note: "drive uses plain audit log; no chain to verify" }));
    return 0;
  }
  console.error(HELP);
  return 1;
}

async function privateCmd(args) {
  const sub = args[0];
  if (sub === "set" || sub === "unset") {
    const folderId = args[1];
    const r = await fetchJson("/v1/encrypted-folders", {
      method: "POST",
      body: JSON.stringify({ folderId, enabled: sub === "set" }),
    });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  if (sub === "list") {
    const r = await fetchJson("/v1/encrypted-folders");
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  console.error(HELP);
  return 1;
}

async function projectsCmd(args) {
  const sub = args[0];
  if (sub === "ensure") {
    const slug = args[1];
    const r = await fetchJson(`/v1/projects/${encodeURIComponent(slug)}/ensure-folder`, { method: "POST" });
    console.log(fmt(r.body));
    return r.ok ? 0 : 1;
  }
  console.error(HELP);
  return 1;
}

export async function runDriveCli(args) {
  const head = args[0];
  if (head !== "drive") {
    console.error(HELP);
    return 1;
  }
  const sub = args[1];
  const rest = args.slice(2);
  switch (sub) {
    case "login": return await login(rest);
    case "items": return await itemsCmd(rest);
    case "folders": return await foldersCmd(rest);
    case "upload": return await uploadCmd(rest);
    case "download": return await downloadCmd(rest);
    case "search": return await searchCmd(rest);
    case "thumbnail": return await thumbnailCmd(rest);
    case "exif": return await exifCmd(rest);
    case "shares": return await sharesCmd(rest);
    case "tokens": return await tokensCmd(rest);
    case "audit": return await auditCmd(rest);
    case "private": return await privateCmd(rest);
    case "projects": return await projectsCmd(rest);
    default:
      console.error(HELP);
      return 1;
  }
}
