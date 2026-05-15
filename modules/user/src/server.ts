import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { UserService } from "./service";
import { seedUser } from "./seed";

function sendJson(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res: http.ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(html);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

export function startServer(service: UserService, host: string, port: number): http.Server {
  const uiPath = path.join(__dirname, "ui.html");

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    try {
      if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
        const html = fs.readFileSync(uiPath, "utf8");
        sendHtml(res, html);
        return;
      }

      if (method === "GET" && pathname === "/api/sources") {
        sendJson(res, { workspace: service.workspace, sources: service.listSources() });
        return;
      }

      if (method === "POST" && pathname === "/api/sources/refresh") {
        service.refreshDiscovery();
        sendJson(res, { ok: true, sources: service.listSources() });
        return;
      }

      if (method === "GET" && pathname === "/api/users") {
        sendJson(res, { users: service.listUsers() });
        return;
      }

      if (method === "GET" && pathname === "/api/graph") {
        const userId = url.searchParams.get("userId") ?? undefined;
        sendJson(res, service.buildUserGraph(userId || undefined));
        return;
      }

      const userMatch = /^\/api\/users\/([^/]+)$/.exec(pathname);
      if (method === "GET" && userMatch) {
        const userId = decodeURIComponent(userMatch[1]);
        sendJson(res, service.getUserBundle(userId));
        return;
      }

      if (method === "PATCH" && pathname === "/api/row") {
        const body = await readJsonBody(req);
        const result = service.updateRow({
          source: String(body.source ?? ""),
          table: String(body.table ?? ""),
          primaryKey: String(body.primaryKey ?? ""),
          updates: (body.updates as Record<string, unknown>) ?? {},
        });
        sendJson(res, result);
        return;
      }

      if (method === "DELETE" && pathname === "/api/row") {
        const body = await readJsonBody(req);
        const result = service.deleteRow({
          source: String(body.source ?? ""),
          table: String(body.table ?? ""),
          primaryKey: String(body.primaryKey ?? ""),
        });
        sendJson(res, result);
        return;
      }

      if (method === "PATCH" && pathname === "/api/memory/person") {
        const body = await readJsonBody(req);
        const result = service.updateMemoryPerson(String(body.id ?? ""), {
          title: typeof body.title === "string" ? body.title : undefined,
          frontmatter: (body.frontmatter as Record<string, unknown> | undefined) ?? undefined,
          body: typeof body.body === "string" ? body.body : undefined,
        });
        sendJson(res, result);
        return;
      }

      if (method === "POST" && pathname === "/api/seed") {
        const body = await readJsonBody(req);
        const userId = String(body.userId ?? body.id ?? "test-user-001");
        const reports = seedUser(service.workspace, userId);
        service.refreshDiscovery();
        sendJson(res, { ok: true, userId, reports });
        return;
      }

      if (method === "PATCH" && pathname === "/api/telegram/account") {
        const body = await readJsonBody(req);
        const result = service.updateTelegramAccount(
          String(body.accountId ?? ""),
          (body.updates as Record<string, unknown>) ?? {}
        );
        sendJson(res, result);
        return;
      }

      sendJson(res, { error: "Not found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      sendJson(res, { error: message }, 500);
    }
  });

  server.listen(port, host, () => {
    process.stdout.write(`\n  User UI running at http://${host}:${port}\n\n`);
  });

  return server;
}
