import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AgentStoreFS, resolveAgentStoreHome } from "./store.ts";

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-agents-store-"));
}

describe("AgentStoreFS connection secrets", () => {
  test("resolves the default global home through the shared storage helper", () => {
    expect(resolveAgentStoreHome({ homeDir: "/Users/demo" })).toBe("/Users/demo/.claw");
    expect(resolveAgentStoreHome({ home: "~", homeDir: "/Users/demo" })).toBe("/Users/demo");
    expect(resolveAgentStoreHome({ home: "~/custom-claw", homeDir: "/Users/demo" })).toBe("/Users/demo/custom-claw");
    expect(resolveAgentStoreHome({ clawHome: "~", homeDir: "/Users/demo" })).toBe("/Users/demo");
    expect(resolveAgentStoreHome({ clawHome: "~/env-claw", homeDir: "/Users/demo" })).toBe("/Users/demo/env-claw");
    expect(resolveAgentStoreHome({ home: "/tmp/explicit", clawHome: "~/env-claw", homeDir: "/Users/demo" })).toBe("/tmp/explicit");
  });

  test("stores connection credentials only as opaque secret refs", () => {
    const home = tempHome();
    const store = new AgentStoreFS({ home });

    store.writeConnection({
      id: "telegram-main",
      service: "telegram",
      label: "Telegram Main",
      scopes: ["messages"],
      secretRef: "secret_ref:connection.telegram-main.auth",
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
    });

    const connection = store.readConnection("telegram-main");
    expect(connection?.secretRef).toBe("secret_ref:connection.telegram-main.auth");
    expect(store.readConnectionSecretRef("telegram-main")).toBe("secret_ref:connection.telegram-main.auth");

    const authPath = path.join(home, "connections", "telegram-main", "auth.encrypted");
    expect(fs.existsSync(authPath)).toBe(false);
    expect(fs.readFileSync(path.join(home, "connections", "telegram-main", "connection.yaml"), "utf8")).not.toContain("bot-token");
  });

  test("fails closed for legacy plaintext auth helpers and removes old files", () => {
    const home = tempHome();
    const store = new AgentStoreFS({ home });
    const connectionDir = path.join(home, "connections", "legacy");
    fs.mkdirSync(connectionDir, { recursive: true });
    const authPath = path.join(connectionDir, "auth.encrypted");
    fs.writeFileSync(authPath, Buffer.from("legacy-token"));

    expect(() => store.writeConnectionAuth("legacy", "new-token")).toThrow(/plaintext storage is disabled/);
    expect(fs.existsSync(authPath)).toBe(true);
    expect(store.readConnectionAuth("legacy")).toBeNull();
    expect(fs.existsSync(authPath)).toBe(false);
  });

  test("rewriting a connection removes stale auth.encrypted", () => {
    const home = tempHome();
    const store = new AgentStoreFS({ home });
    const connectionDir = path.join(home, "connections", "slack-main");
    fs.mkdirSync(connectionDir, { recursive: true });
    fs.writeFileSync(path.join(connectionDir, "auth.encrypted"), Buffer.from("legacy-token"));

    store.writeConnection({
      id: "slack-main",
      service: "slack",
      label: "Slack Main",
      scopes: [],
      secretRef: "secret_ref:connection.slack-main.auth",
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
    });

    expect(fs.existsSync(path.join(connectionDir, "auth.encrypted"))).toBe(false);
  });
});
