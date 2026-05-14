import { describe, expect, it } from "vitest";
import type { AgentStoreFS, Connection } from "@clawjs/agents";
import { IntegrationManager } from "./manager.js";

const connection: Connection = {
  id: "telegram-main",
  service: "telegram",
  label: "Telegram",
  scopes: [],
  secretRef: "secret_ref:connection.telegram-main.auth",
  createdAt: "2026-05-14T00:00:00.000Z",
  updatedAt: "2026-05-14T00:00:00.000Z",
};

function storeThatFailsOnPlaintextRead(): AgentStoreFS {
  return {
    listConnections: () => [connection],
    readConnection: (id: string) => (id === connection.id ? connection : undefined),
    readConnectionAuth: () => {
      throw new Error("readConnectionAuth must not be called");
    },
    listAgents: () => [],
  } as unknown as AgentStoreFS;
}

describe("IntegrationManager", () => {
  it("does not resolve plaintext auth when starting legacy watchers", async () => {
    const manager = new IntegrationManager({
      store: storeThatFailsOnPlaintextRead(),
      deliver: () => {},
    });

    await expect(manager.startOne(connection.id)).resolves.toBe(false);
  });

  it("does not resolve plaintext auth for legacy outbound sends", async () => {
    const manager = new IntegrationManager({
      store: storeThatFailsOnPlaintextRead(),
      deliver: () => {},
    });

    await expect(manager.send(connection.id, "chat", "hello")).resolves.toBe(false);
  });
});
