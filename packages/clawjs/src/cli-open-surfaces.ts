import { clawAppPorts, clawCorePorts } from "@clawjs/core";

type OpenSurfaceKind = "internal-database" | "internal-storage" | "cli-serve" | "server-script" | "memory" | "agenda" | "next";

export interface OpenSurface {
  id: string;
  label: string;
  port: number;
  aliases?: string[];
  kind: OpenSurfaceKind;
  dir?: string;
  script?: string;
  envHost?: string;
  envPort?: string;
  buildCheck?: string;
}

export interface OpenSurfaceState {
  surface: string;
  pid: number;
  host: string;
  port: number;
  url: string;
  targetUrl?: string;
  workspace: string;
  startedAt: string;
}

export const OPEN_SURFACES: OpenSurface[] = [
  { id: "memory", label: "Memory", port: clawCorePorts.memory, kind: "memory", dir: "memory", buildCheck: "dist/cli.js" },
  { id: "storage", label: "Storage", port: 24140, kind: "internal-storage", dir: "storage/ui", buildCheck: "dist/index.html" },
  { id: "database", label: "Database", port: clawCorePorts.database, aliases: ["db"], kind: "internal-database" },
  { id: "secrets", label: "Secrets", port: clawCorePorts.secrets, kind: "server-script", dir: "secrets", script: "dist/server.js", envHost: "CLAW_SECRETS_HOST", envPort: "CLAW_SECRETS_PORT", buildCheck: "dist/server.js" },
  { id: "time", label: "Time", port: 24141, kind: "server-script", dir: "time", script: "dist/server.js", envHost: "CLAW_TIME_HOST", envPort: "CLAW_TIME_PORT", buildCheck: "dist/server.js" },
  { id: "feed", label: "Feed", port: 24142, kind: "cli-serve", dir: "modules/feed", buildCheck: "dist/cli.js" },
  { id: "relay", label: "Relay", port: 24143, kind: "server-script", dir: "relay", script: "dist/server.js", envHost: "CLAW_RELAY_HOST", envPort: "CLAW_RELAY_PORT", buildCheck: "dist/server.js" },
  { id: "monitor", label: "Monitor", port: clawCorePorts.monitor, kind: "server-script", dir: "monitor", script: "dist/main.js", envHost: "CLAW_MONITOR_HOST", envPort: "CLAW_MONITOR_PORT", buildCheck: "dist/main.js" },
  { id: "drive", label: "Drive", port: clawCorePorts.drive, kind: "cli-serve", dir: "drive", buildCheck: "dist/cli.js" },
  { id: "wiki", label: "Wiki", port: 24144, kind: "cli-serve", dir: "wiki", buildCheck: "dist/cli.js" },
  { id: "jobs", label: "Jobs", port: 24145, kind: "server-script", dir: "execution", script: "dist/server.js", envHost: "CLAW_JOBS_HOST", envPort: "CLAW_JOBS_PORT", buildCheck: "dist/server.js" },
  { id: "delegation", label: "Delegation", port: 24146, aliases: ["delegation"], kind: "server-script", dir: "delegation", script: "dist/server.js", envHost: "CLAW_DELEGATION_HOST", envPort: "CLAW_DELEGATION_PORT", buildCheck: "dist/server.js" },
  { id: "publishing", label: "Publishing", port: clawCorePorts.publishing, kind: "cli-serve", dir: "publishing", buildCheck: "dist/cli.js" },
  { id: "erp", label: "ERP", port: 24147, kind: "cli-serve", dir: "modules/erp", buildCheck: "dist/cli.js" },
  { id: "iot", label: "IoT", port: 24148, kind: "cli-serve", dir: "iot", buildCheck: "dist/cli.js" },
  { id: "agenda", label: "Agenda", port: clawAppPorts.agenda, kind: "agenda", dir: "apps/agenda", buildCheck: "dist/serve-dashboard.js" },
  { id: "board", label: "Board", port: clawAppPorts.board, kind: "next", dir: "apps/board", buildCheck: ".next" },
  { id: "channels", label: "Channels", port: clawAppPorts.channels, kind: "next", dir: "apps/channels", buildCheck: ".next" },
  { id: "user", label: "User", port: 24149, kind: "cli-serve", dir: "modules/user", buildCheck: "dist/cli.js" },
];

export const OPEN_SURFACE_BY_NAME = new Map<string, OpenSurface>(
  OPEN_SURFACES.flatMap((surface) => [
    [surface.id, surface],
    ...(surface.aliases ?? []).map((alias) => [alias, surface] as const),
  ]),
);
