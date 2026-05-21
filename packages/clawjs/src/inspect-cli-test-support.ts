import { clawPersistentSurfaceRegistry } from "@clawjs/core/catalogs";
import { runCli } from "./index.ts";

function captureStream() {
  let output = "";
  return {
    stream: {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    } as unknown as NodeJS.WritableStream,
    getOutput() {
      return output;
    },
  };
}

export async function runCliCapture(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await runCli(args, { stdout: stdout.stream, stderr: stderr.stream, cwd });
  return { code, stdout: stdout.getOutput(), stderr: stderr.getOutput() };
}

export const expectedSyncDrivers = ["skills", "memory_user_model", "sessions", "drive_files", "blobs", "sqlite_tables", "sqlite_partial", "sidecar", "search_index", "agent_config", "workspace_state"];
export const expectedSyncDriverRouteIds = ["sync.skills", "sync.memoryUserModel", "sync.sessions", "sync.driveFiles", "sync.blobs", "sync.sqliteResources", "sync.sqliteResources", "sync.sidecars", "sync.searchIndex", "sync.agentConfig", "sync.workspaceState"];
export const expectedSyncDriverRequiredRouteIds = ["sync.agentConfig", "sync.blobs", "sync.driveFiles", "sync.memoryUserModel", "sync.searchIndex", "sync.sessions", "sync.sidecars", "sync.skills", "sync.sqliteResources", "sync.workspaceState"];
export const expectedInspectSyncRouteIds = ["sync.skills", "sync.memoryUserModel", "sync.sessions", "sync.driveFiles", "sync.blobs", "sync.sqliteResources", "sync.sidecars", "sync.agentConfig", "sync.workspaceState", "sync.searchIndex"];
export const expectedSyncDriverLateralDomains = [["skills"], ["memory", "user_model", "profile"], ["sessions"], ["drive", "files"], ["blobs", "files"], ["database", "records"], ["database", "partial_database"], ["sidecars", "runtime"], ["search", "indexes"], ["agents", "config"], ["workspace", "projects"]];
export const expectedSyncDriverCommands = expectedSyncDrivers.map((driver) => [
  `claw sync manifest --driver ${driver} --json`,
  `claw sync plan --driver ${driver} --json`,
  `claw sync apply --driver ${driver} --record true --json`,
]);
export const expectedRemoteSafeClassificationIds = [
  "claw.agents",
  "claw.agents.assignments",
  "claw.remote.client",
  "claw.relay",
  "claw.relay.connector",
  "claw.coordinator",
  "claw.gateway",
  "claw.connector",
  "claw.sync",
  "claw.transport.iroh",
  "claw.headlessHost",
  "claw.remoteCache",
  "claw.remote.classification",
  "claw.search",
  "claw.secrets.broker",
  "claw.drive.files",
  "claw.memory.userModel",
  "claw.skills.library",
  "claw.mesh.share",
];
export const expectedRemoteApiMethodRoutes = [
  "GET /v1/remote/classifications",
  "POST /v1/remote/classifications/receipts",
  "GET /v1/remote/conformance",
  "GET /v1/remote/offline-command",
  "POST /v1/remote/offline-command",
  "GET /v1/remote/external-pending",
  "GET /v1/remote/external-validation-checklist",
  "GET /v1/remote/external-validation-template",
  "POST /v1/remote/external-validation-template",
  "GET /v1/remote/external-validation-artifact",
  "POST /v1/remote/external-validation-artifact",
  "GET /v1/remote/external-validation-runbook",
  "GET /v1/remote/external-validation-readiness",
  "POST /v1/remote/external-validation-readiness",
  "GET /v1/remote/external-validation-approval-request",
  "POST /v1/remote/external-validation-approval-request",
  "GET /v1/remote/external-validation-report",
  "POST /v1/remote/external-validation-report",
  "GET /v1/remote/source-qa-template",
  "POST /v1/remote/source-qa-template",
  "GET /v1/remote/decision-review",
  "POST /v1/remote/decision-review",
  "GET /v1/remote/closure-gate",
  "POST /v1/remote/closure-gate",
  "GET /v1/remote/route-contracts",
  "GET /v1/remote/provider-device-e2e-plan",
  "GET /v1/remote/custom-app-sdk",
  "GET /v1/remote/compatibility/adapters",
  "POST /v1/remote/compatibility/adapters",
  "GET /v1/sync/drivers",
  "GET /v1/sync/manifests",
  "POST /v1/sync/manifests",
  "GET /v1/sync/changes",
  "POST /v1/sync/plan",
  "POST /v1/sync/conflicts",
  "POST /v1/sync/applications",
  "POST /v1/sync/authority-handoffs",
  "GET /v1/nodes",
  "POST /v1/nodes/pair",
  "POST /v1/nodes/trust",
  "POST /v1/nodes/revoke",
  "POST /v1/mesh/invitations",
  "POST /v1/mesh/invitations/accept",
  "POST /v1/mesh/shares",
  "POST /v1/mesh/revocations",
  "GET /v1/gateway/conformance",
  "POST /v1/gateway/agent-service/evaluate",
  "POST /v1/gateway/agent-service/executions",
  "POST /v1/gateway/audit/receipts",
];

export function expectedRemoteClassificationEntries() {
  return clawPersistentSurfaceRegistry.nodes
    .filter((node) => node.programmaticSurfaces?.includes("relay") || node.surfaceGaps?.some((gap) => gap.surface === "relay"))
    .map((node) => ({
      id: node.id,
      classification: node.programmaticSurfaces?.includes("relay")
        ? "remote-safe"
        : node.surfaceGaps?.find((gap) => gap.surface === "relay")?.status ?? "pending",
    }));
}

export function parseCliJson<T>(stdout: string): { ok: boolean; data: T; meta: { schemaVersion: number; canonicalCommand: string; subcommand?: string } } {
  return JSON.parse(stdout);
}
