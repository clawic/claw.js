import fs from "fs";
import http from "http";
import path from "path";

import { createLocalStorageStore, createStorageHttpHandler } from "@clawjs/claw";
import { clawStorageApiRoutes, resolveClawPersistentSurfacePath } from "@clawjs/core";
import { buildDatabaseApp } from "@clawjs/database";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { openStateDir, repoRootFromCliPackage } from "./cli-open-state.ts";
import { resolveOpenSurface } from "./cli-open-surfaces.ts";
import type { CliContext } from "./index.ts";

function parseOpenServerPort(raw: string | undefined, fallback: number): number {
  const port = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new CliHandledError("invalid_port", `Invalid port: ${raw ?? fallback}`, CLI_EXIT_USAGE);
  }
  return port;
}

function parseOpenServerHost(raw: string | undefined): string {
  const host = raw ?? "127.0.0.1";
  if (!host || host !== host.trim() || /[\x00-\x20/\\]/.test(host)) {
    throw new CliHandledError("invalid_host", `Invalid host: ${raw ?? host}`, CLI_EXIT_USAGE);
  }
  return host;
}

function sendStaticFile(response: http.ServerResponse, filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".html" ? "text/html; charset=utf-8"
    : ext === ".js" ? "text/javascript; charset=utf-8"
      : ext === ".css" ? "text/css; charset=utf-8"
        : ext === ".svg" ? "image/svg+xml"
          : "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });
  response.end(fs.readFileSync(filePath));
}

export async function runOpenServerCommand(input: { positionals: string[]; flags: Record<string, string>; context: CliContext }): Promise<number> {
  const surface = resolveOpenSurface(input.positionals[1]);
  if (!surface) throw new CliHandledError("unknown_dashboard", `Unknown dashboard: ${input.positionals[1]}`, CLI_EXIT_USAGE);
  const host = parseOpenServerHost(input.flags.host);
  const port = parseOpenServerPort(input.flags.port, surface.port);
  const workspace = path.resolve(input.context.cwd, input.flags.workspace ?? ".");

  if (surface.kind === "internal-database") {
    const { app } = buildDatabaseApp({
      config: {
        host,
        port,
        dataDir: resolveClawPersistentSurfacePath("claw.workspace.dashboard_database", workspace),
      },
    });
    await app.listen({ host, port });
    await new Promise(() => undefined);
    return CLI_EXIT_OK;
  }

  if (surface.kind === "internal-storage") {
    const store = createLocalStorageStore({
      workspaceDir: workspace,
      agentId: "dashboard-storage",
      grants: [{
        bucket: "workspace",
        operations: ["objects:list", "objects:read", "objects:write", "objects:delete", "shares:create", "shares:revoke"],
      }],
    });
    const issued = store.issueToken({
      label: "storage dashboard",
      grants: [{
        bucket: "workspace",
        operations: ["objects:list", "objects:read", "objects:write", "objects:delete", "shares:create", "shares:revoke"],
      }],
    });
    fs.mkdirSync(openStateDir(), { recursive: true });
    fs.writeFileSync(path.join(openStateDir(), `storage-token-${host}-${port}.txt`), `${issued.token}\n`);
    const storageHandler = createStorageHttpHandler({ store });
    const uiRoot = path.join(repoRootFromCliPackage(), "storage", "ui", "dist");
    const server = http.createServer(async (request, response) => {
      const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
      if (requestUrl.pathname.startsWith(clawStorageApiRoutes.apiPrefix) || requestUrl.pathname.startsWith(clawStorageApiRoutes.sharedPrefix)) {
        await storageHandler(request, response);
        return;
      }
      const normalized = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^(\.\.[/\\])+/, "");
      const candidate = path.join(uiRoot, normalized === "/" ? "index.html" : normalized);
      const filePath = candidate.startsWith(uiRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
        ? candidate
        : path.join(uiRoot, "index.html");
      sendStaticFile(response, filePath);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });
    await new Promise(() => undefined);
    return CLI_EXIT_OK;
  }

  throw new CliHandledError("invalid_dashboard_server", `${surface.id} is not an internal open server.`);
}
