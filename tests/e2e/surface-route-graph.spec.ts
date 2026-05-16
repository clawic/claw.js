import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";

import { expect, test } from "./fixtures";

const execFileAsync = promisify(execFile);
const BIN = path.join(process.cwd(), "packages", "clawjs", "bin", "claw.mjs");

async function inspect(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync(process.execPath, [BIN, "inspect", ...args, "--json"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAW_E2E_DISABLE_EXTERNAL_CALLS: "1",
      CLAW_E2E_FIXTURE_MODE: "1",
    },
  });
  const envelope = JSON.parse(stdout) as { ok: boolean; data: unknown };
  expect(envelope.ok).toBe(true);
  return envelope.data;
}

test("surface route graph exposes the three hermetic chat routes", async () => {
  const routes = await inspect(["routes"]) as Array<{
    id: string;
    validation: string;
    steps: Array<{ edgeType: string; fromId: string; toId: string; contractId?: string; validation?: string }>;
    tests: string[];
  }>;

  const byId = new Map(routes.map((route) => [route.id, route]));
  expect([...byId.keys()].sort()).toContain("chat.localDesktop");
  expect([...byId.keys()].sort()).toContain("chat.companionBridge");
  expect([...byId.keys()].sort()).toContain("chat.remoteRelay");

  for (const routeId of ["chat.localDesktop", "chat.companionBridge", "chat.remoteRelay"]) {
    const route = byId.get(routeId);
    expect(route, `${routeId} must be registered`).toBeDefined();
    expect(route?.validation).toContain("Fixture + hermetic");
    expect(route?.tests).toContain("packages/clawjs/src/inspect-cli.test.ts");
    expect(route?.steps.length).toBeGreaterThan(0);
    expect(route?.steps.every((step) => ["consumes", "owns", "exposes", "brokers"].includes(step.edgeType))).toBe(true);
    expect(route?.steps.every((step) => Boolean(step.fromId && step.toId && step.contractId && step.validation))).toBe(true);
  }
});

test("surface route graph lets agents inspect Relay and bridge neighborhoods without services", async () => {
  const relay = await inspect(["show", "claw.relay"]) as {
    id: string;
    incomingEdges: Array<{ fromId: string; type: string }>;
    outgoingEdges: Array<{ toId: string; type: string }>;
    routes: Array<{ id: string }>;
  };
  expect(relay.id).toBe("claw.relay");
  expect(relay.incomingEdges.some((edge) => edge.fromId === "claw.remote.client" && edge.type === "consumes")).toBe(true);
  expect(relay.outgoingEdges.some((edge) => edge.toId === "claw.relay.connector" && edge.type === "brokers")).toBe(true);
  expect(relay.routes.some((route) => route.id === "chat.remoteRelay")).toBe(true);

  const bridge = await inspect(["neighbors", "clawix.bridge.local"]) as {
    neighbors: Array<{ id: string }>;
    routes: Array<{ id: string }>;
  };
  expect(bridge.neighbors.some((node) => node.id === "claw.daemon.local")).toBe(true);
  expect(bridge.neighbors.some((node) => node.id === "clawix.ui.chat")).toBe(true);
  expect(bridge.routes.some((route) => route.id === "chat.localDesktop")).toBe(true);
  expect(bridge.routes.some((route) => route.id === "chat.companionBridge")).toBe(true);
});
