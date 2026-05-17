import { describe, expect, it } from "vitest";
import type { AgentStoreFS, Connection } from "@clawjs/agents";
import { IntegrationConnectionController } from "./connection-controller.js";

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

describe("IntegrationConnectionController", () => {
  it("does not resolve plaintext auth when starting connector listeners", async () => {
    const controller = new IntegrationConnectionController({
      store: storeThatFailsOnPlaintextRead(),
      deliver: () => {},
    });

    await expect(controller.startOne(connection.id)).resolves.toBe(false);
  });

  it("does not resolve plaintext auth for connector outbound sends", async () => {
    const controller = new IntegrationConnectionController({
      store: storeThatFailsOnPlaintextRead(),
      deliver: () => {},
    });

    await expect(controller.send(connection.id, "chat", "hello")).resolves.toBe(false);
  });
});
