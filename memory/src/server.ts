import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { MemoryService } from "./service";
import { initWorkspace } from "./workspace";
import { LoadedSchema, ParsedNote } from "./types";

const CLAW_PUBLIC_API_PREFIX = "/v1";

function clawApiPath(pathname = ""): string {
  const suffix = pathname.replace(/^\/+/, "");
  return suffix ? `${CLAW_PUBLIC_API_PREFIX}/${suffix}` : CLAW_PUBLIC_API_PREFIX;
}

type GraphNode = {
  id: string;
  title: string;
  type: string;
  noteKind: string;
  semanticKind: string;
  slug: string | null;
};

type GraphEdge = {
  source: string;
  target: string;
  relation: string;
  metadata: Record<string, unknown>;
};

function buildGraphData(
  notes: ParsedNote[],
  schema: LoadedSchema,
  service: MemoryService
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = notes.map((note) => {
    const definition =
      note.kind === "entity"
        ? schema.entityTypes.get(note.type)
        : schema.memoryTypes.get(note.type);
    return {
      id: note.id,
      title: note.title,
      type: note.type,
      noteKind: note.kind,
      semanticKind: definition?.kindId ?? "unknown",
      slug: note.slug,
    };
  });

  const edges: GraphEdge[] = [];
  const noteById = new Map(notes.map((n) => [n.id, n]));

  for (const note of notes) {
    const definition =
      note.kind === "entity"
        ? schema.entityTypes.get(note.type)
        : schema.memoryTypes.get(note.type);
    if (!definition?.relations) continue;

    for (const [relationName, relationDef] of Object.entries(definition.relations)) {
      const rawValue = note.frontmatter[relationName];
      if (rawValue === undefined) continue;

      const refs = extractRelationRefs(rawValue);
      for (const ref of refs) {
        const targetNote = findNoteByReference(notes, ref.targetRef);
        if (targetNote) {
          edges.push({
            source: note.id,
            target: targetNote.id,
            relation: relationName,
            metadata: ref.metadata,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

function extractRelationRefs(
  value: unknown
): Array<{ targetRef: string; metadata: Record<string, unknown> }> {
  if (typeof value === "string") {
    return [{ targetRef: normalizeRef(value), metadata: {} }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === "string") {
        return [{ targetRef: normalizeRef(entry), metadata: {} }];
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>;
        const target = record.target;
        if (typeof target === "string") {
          const metadata: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(record)) {
            if (k !== "target") metadata[k] = v;
          }
          return [{ targetRef: normalizeRef(target), metadata }];
        }
      }
      return [];
    });
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const target = record.target;
    if (typeof target === "string") {
      const metadata: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(record)) {
        if (k !== "target") metadata[k] = v;
      }
      return [{ targetRef: normalizeRef(target), metadata }];
    }
  }
  return [];
}

function normalizeRef(ref: string): string {
  const match = ref.match(/^\[\[(.+)\]\]$/);
  return (match ? match[1] : ref).trim().toLowerCase();
}

function findNoteByReference(notes: ParsedNote[], ref: string): ParsedNote | null {
  const normalized = ref.toLowerCase().trim();
  return (
    notes.find((n) => n.id.toLowerCase() === normalized) ??
    notes.find((n) => n.slug?.toLowerCase() === normalized) ??
    notes.find((n) => {
      const aliases = Array.isArray(n.frontmatter.aliases) ? n.frontmatter.aliases : [];
      return aliases.some(
        (a: unknown) => typeof a === "string" && a.toLowerCase().trim() === normalized
      );
    }) ??
    null
  );
}

function getNoteDetail(note: ParsedNote, schema: LoadedSchema) {
  const definition =
    note.kind === "entity"
      ? schema.entityTypes.get(note.type)
      : schema.memoryTypes.get(note.type);

  return {
    id: note.id,
    slug: note.slug,
    kind: note.kind,
    type: note.type,
    title: note.title,
    semanticKind: definition?.kindId ?? "unknown",
    schemaVersion: note.schemaVersion,
    frontmatter: note.frontmatter,
    body: note.body,
    typeDefinition: definition,
  };
}

function serializeSchema(schema: LoadedSchema) {
  return {
    version: schema.version,
    hash: schema.hash,
    entityKinds: Object.fromEntries(schema.entityKinds),
    memoryKinds: Object.fromEntries(schema.memoryKinds),
    entityTypes: Object.fromEntries(schema.entityTypes),
    memoryTypes: Object.fromEntries(schema.memoryTypes),
  };
}

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res: http.ServerResponse, html: string) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(html);
}

export function startServer(
  service: MemoryService,
  port: number,
  options: { host?: string; statusFile?: string; workspace?: string } = {}
): http.Server {
  const uiPath = path.join(__dirname, "ui.html");
  const host = options.host ?? "127.0.0.1";

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = url.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Memory-Editor",
      });
      res.end();
      return;
    }

    try {
      if (pathname === "/" || pathname === "/index.html") {
        const html = fs.readFileSync(uiPath, "utf8");
        sendHtml(res, html);
        return;
      }

      if (pathname === clawApiPath("health") || pathname === "/health" || pathname === "/healthz") {
        sendJson(res, { ok: true, service: "memory", host, port });
        return;
      }

      if (pathname === "/api/schema") {
        const schema = service.loadSchema();
        sendJson(res, serializeSchema(schema));
        return;
      }

      if (pathname === "/api/notes" && (req.method === "GET" || req.method === undefined)) {
        const validation = service.validate();
        const schema = validation.schema;
        const noteKind = url.searchParams.get("noteKind");
        const type = url.searchParams.get("type");
        const text = url.searchParams.get("text");

        let notes = validation.notes;
        if (noteKind) notes = notes.filter((n) => n.kind === noteKind);
        if (type) notes = notes.filter((n) => n.type === type);
        if (text) {
          const lower = text.toLowerCase();
          notes = notes.filter(
            (n) =>
              n.title.toLowerCase().includes(lower) ||
              n.id.toLowerCase().includes(lower) ||
              n.body.toLowerCase().includes(lower)
          );
        }

        sendJson(
          res,
          notes.map((n) => getNoteDetail(n, schema))
        );
        return;
      }

      if (pathname === "/api/search") {
        const result = service.activeSearch({
          text: url.searchParams.get("q") ?? url.searchParams.get("text") ?? "",
          limit: parseOptionalInteger(url.searchParams.get("limit")),
          minScore: parseOptionalNumber(url.searchParams.get("minScore")),
          includeHistory: url.searchParams.get("includeHistory") === "true",
          semantic: url.searchParams.get("semantic") === "true",
          memoryClass: parseMemoryClass(url.searchParams.get("class")),
          scopeUser: url.searchParams.get("scopeUser") ?? undefined,
          scopeAgent: url.searchParams.get("scopeAgent") ?? undefined,
          scopeProject: url.searchParams.get("scopeProject") ?? undefined
        });
        sendJson(res, result);
        return;
      }

      if (pathname === "/api/context") {
        const result = service.contextBundle({
          text: url.searchParams.get("q") ?? url.searchParams.get("text") ?? "",
          limit: parseOptionalInteger(url.searchParams.get("limit")),
          minScore: parseOptionalNumber(url.searchParams.get("minScore")),
          includeHistory: url.searchParams.get("includeHistory") === "true",
          semantic: url.searchParams.get("semantic") === "true",
          memoryClass: parseMemoryClass(url.searchParams.get("class")),
          scopeUser: url.searchParams.get("scopeUser") ?? undefined,
          scopeAgent: url.searchParams.get("scopeAgent") ?? undefined,
          scopeProject: url.searchParams.get("scopeProject") ?? undefined
        });
        sendJson(res, result);
        return;
      }

      if (pathname === "/api/timeline") {
        sendJson(res, service.timeline(url.searchParams.get("includeHistory") !== "false"));
        return;
      }

      if (pathname === "/api/captures") {
        sendJson(res, { captures: service.listCaptures() });
        return;
      }

      if (pathname === "/api/tools/status") {
        sendJson(res, service.activeStatus());
        return;
      }

      if (pathname === "/api/tools/search") {
        sendJson(
          res,
          service.activeSearch({
            text: url.searchParams.get("q") ?? "",
            limit: parseOptionalInteger(url.searchParams.get("limit")),
            semantic: url.searchParams.get("semantic") === "true"
          })
        );
        return;
      }

      if (pathname.startsWith("/api/tools/get/")) {
        sendJson(res, service.getNote(decodeURIComponent(pathname.slice("/api/tools/get/".length))));
        return;
      }

      if (req.method === "POST" && pathname === "/api/tools/save") {
        sendJson(res, service.saveMemory(await readJsonBody(req) as Parameters<MemoryService["saveMemory"]>[0]));
        return;
      }

      if (req.method === "POST" && pathname === "/api/tools/conclude") {
        const body = await readJsonBody(req);
        sendJson(
          res,
          service.concludeMemory(
            String(body.content ?? ""),
            body as Parameters<MemoryService["concludeMemory"]>[1]
          )
        );
        return;
      }

      if (req.method === "POST" && pathname === "/api/capture") {
        sendJson(res, service.captureTurn(await readJsonBody(req) as Parameters<MemoryService["captureTurn"]>[0]));
        return;
      }

      if (req.method === "POST" && pathname === "/api/promote") {
        const body = await readJsonBody(req);
        sendJson(res, service.promoteCapture(String(body.id ?? "")));
        return;
      }

      if (pathname === "/api/export") {
        sendJson(
          res,
          service.exportScopedMemory({
            scopeUser: url.searchParams.get("scopeUser") ?? undefined,
            scopeAgent: url.searchParams.get("scopeAgent") ?? undefined,
            scopeProject: url.searchParams.get("scopeProject") ?? undefined
          })
        );
        return;
      }

      if (pathname.startsWith("/api/notes/")) {
        const noteId = decodeURIComponent(pathname.slice("/api/notes/".length));

        if (req.method === "PATCH") {
          const body = (await readJsonBody(req)) as Record<string, unknown>;
          const editorHeader = (req.headers["x-memory-editor"] as string | undefined)?.toLowerCase();
          const editor: "user" | "agent" | "system" =
            editorHeader === "agent" || editorHeader === "system" ? editorHeader : "user";
          const patch: Parameters<MemoryService["updateNote"]>[1] = {};
          if (typeof body.title === "string") patch.title = body.title;
          if (typeof body.body === "string") patch.body = body.body;
          if (Array.isArray(body.tags)) patch.tags = body.tags.map((t) => String(t));
          if ("scopeUser" in body) patch.scopeUser = body.scopeUser as string | null;
          if ("scopeAgent" in body) patch.scopeAgent = body.scopeAgent as string | null;
          if ("scopeProject" in body) patch.scopeProject = body.scopeProject as string | null;
          if (typeof body.memoryClass === "string") {
            const mc = parseMemoryClass(body.memoryClass);
            if (mc) patch.memoryClass = mc;
          }
          if (body.frontmatter && typeof body.frontmatter === "object" && !Array.isArray(body.frontmatter)) {
            patch.frontmatter = body.frontmatter as Record<string, never>;
          }
          const result = service.updateNote(noteId, patch, editor);
          sendJson(res, result);
          return;
        }

        if (req.method === "DELETE") {
          const result = service.deleteNote(noteId);
          sendJson(res, result);
          return;
        }

        const validation = service.validate();
        const note = validation.notes.find((n) => n.id === noteId);
        if (!note) {
          sendJson(res, { error: "Note not found" }, 404);
          return;
        }
        sendJson(res, getNoteDetail(note, validation.schema));
        return;
      }

      if (req.method === "POST" && pathname === "/api/notes") {
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        const noteKind = body.noteKind === "entity" ? "entity" : "memory";
        const input: Parameters<MemoryService["createNoteManual"]>[0] = {
          noteKind,
          title: String(body.title ?? ""),
          body: String(body.body ?? "")
        };
        if (typeof body.type === "string") input.type = body.type;
        if (typeof body.memoryClass === "string") {
          const mc = parseMemoryClass(body.memoryClass);
          if (mc) input.memoryClass = mc;
        }
        if (Array.isArray(body.tags)) input.tags = body.tags.map((t) => String(t));
        if (typeof body.scopeUser === "string") input.scopeUser = body.scopeUser;
        if (typeof body.scopeAgent === "string") input.scopeAgent = body.scopeAgent;
        if (typeof body.scopeProject === "string") input.scopeProject = body.scopeProject;
        if (typeof body.confidence === "number") input.confidence = body.confidence;
        if (typeof body.trustScore === "number") input.trustScore = body.trustScore;
        const result = service.createNoteManual(input);
        sendJson(res, result, 201);
        return;
      }

      if (pathname === "/api/graph") {
        const validation = service.validate();
        const graph = buildGraphData(validation.notes, validation.schema, service);
        sendJson(res, graph);
        return;
      }

      if (pathname === "/api/stats") {
        const validation = service.validate();
        const schema = validation.schema;

        const entityCount = validation.notes.filter((n) => n.kind === "entity").length;
        const memoryCount = validation.notes.filter((n) => n.kind === "memory").length;

        const typeBreakdown: Record<string, number> = {};
        const kindBreakdown: Record<string, number> = {};
        for (const note of validation.notes) {
          typeBreakdown[note.type] = (typeBreakdown[note.type] ?? 0) + 1;
          const def =
            note.kind === "entity"
              ? schema.entityTypes.get(note.type)
              : schema.memoryTypes.get(note.type);
          const kind = def?.kindId ?? "unknown";
          kindBreakdown[kind] = (kindBreakdown[kind] ?? 0) + 1;
        }

        sendJson(res, {
          total: validation.notes.length,
          entities: entityCount,
          memories: memoryCount,
          valid: validation.valid,
          issues: validation.issues,
          warnings: validation.warnings,
          byType: typeBreakdown,
          byKind: kindBreakdown,
          schemaVersion: schema.version,
        });
        return;
      }

      sendJson(res, { error: "Not found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      sendJson(res, { error: message }, 500);
    }
  });

  server.listen(port, host, () => {
    console.log(`\n  Memory server running at http://${host}:${port}\n`);
    if (options.statusFile) {
      try {
        fs.mkdirSync(path.dirname(options.statusFile), { recursive: true });
        fs.writeFileSync(
          options.statusFile,
          JSON.stringify({
            ready: true,
            host,
            port,
            workspace: options.workspace ?? null,
            startedAt: new Date().toISOString(),
            pid: process.pid
          }),
          "utf8"
        );
      } catch (error) {
        console.error("[memory] could not write status file:", error);
      }
    }
  });

  return server;
}

interface StartMemoryServerOptions {
  port?: number;
  host?: string;
  workspace?: string;
  statusFile?: string;
}

interface StartMemoryServerResult {
  server: http.Server;
  service: MemoryService;
  config: { host: string; port: number; workspace: string };
}

export function startMemoryServer(options: StartMemoryServerOptions = {}): StartMemoryServerResult {
  const port = Number(options.port ?? process.env.CLAW_MEMORY_PORT ?? 24105);
  const host = options.host ?? process.env.CLAW_MEMORY_HOST ?? "127.0.0.1";
  const workspace = path.resolve(
    options.workspace ?? process.env.CLAW_MEMORY_WORKSPACE ?? process.cwd()
  );
  initWorkspace(workspace);
  const service = MemoryService.fromCwd(workspace);
  const server = startServer(service, port, {
    host,
    statusFile: options.statusFile,
    workspace
  });
  return { server, service, config: { host, port, workspace } };
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function parseOptionalInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMemoryClass(value: string | null): "semantic" | "episodic" | "procedural" | "archival" | undefined {
  if (value === "semantic" || value === "episodic" || value === "procedural" || value === "archival") {
    return value;
  }
  return undefined;
}
