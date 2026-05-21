import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { test } from "vitest";
import assert from "node:assert/strict";
import { join } from "node:path";

import { loadConfig } from "../src/config.ts";

function expandHome(value: string, home: string): string {
  return value.startsWith("~/") ? join(home, value.slice(2)) : value;
}

test("loadConfig defaults bridge storage to the canonical runtime sidecar", () => {
  const home = "/tmp/clawjs-bridge-home";
  const root = expandHome(resolveClawPersistentSurfacePath("claw.global.data"), home);
  const config = loadConfig({
    HOME: home,
    CLAW_DATA_DIR: root,
  });

  assert.equal(config.dbPath, join(root, "core.sqlite"));
  assert.equal(config.statusPath, expandHome(resolveClawPersistentSurfacePath("clawix.home.state", "", "bridge-status.json"), home));
});

test("loadConfig defaults to loopback-only transport", () => {
  const config = loadConfig({ HOME: "/tmp/clawjs-bridge-home" });

  assert.equal(config.exposure, "loopback");
  assert.equal(config.bindAddress, "127.0.0.1");
  assert.equal(config.bonjourEnabled, false);
  assert.equal(config.iroh?.enabled, false);
  assert.equal(config.coordinator, undefined);
});

test("loadConfig ignores coordinator credentials until explicitly enabled for remote exposure", () => {
  const config = loadConfig({
    HOME: "/tmp/clawjs-bridge-home",
    CLAW_REMOTE_COORDINATOR_URL: "https://coordinator.example",
    CLAW_REMOTE_COORDINATOR_TOKEN: "token",
    CLAW_REMOTE_COORDINATOR_DEVICE_ID: "device-1",
    CLAW_REMOTE_COORDINATOR_TENANT_ID: "tenant-1",
  });

  assert.equal(config.exposure, "loopback");
  assert.equal(config.coordinator, undefined);
});

test("loadConfig enables Bonjour for explicit pairing exposure unless disabled", () => {
  const config = loadConfig({
    HOME: "/tmp/clawjs-bridge-home",
    CLAW_REMOTE_EXPOSURE: "pairing",
  });

  assert.equal(config.exposure, "pairing");
  assert.equal(config.bonjourEnabled, true);
  assert.equal(config.iroh?.enabled, false);

  const disabled = loadConfig({
    HOME: "/tmp/clawjs-bridge-home",
    CLAW_REMOTE_EXPOSURE: "pairing",
    CLAW_REMOTE_ENABLE_BONJOUR: "1",
    CLAW_REMOTE_DISABLE_BONJOUR: "1",
  });
  assert.equal(disabled.bonjourEnabled, false);
});

test("loadConfig requires positive Bonjour enable for remote exposure", () => {
  const remote = loadConfig({
    HOME: "/tmp/clawjs-bridge-home",
    CLAW_REMOTE_EXPOSURE: "remote",
  });
  assert.equal(remote.bonjourEnabled, false);

  const enabled = loadConfig({
    HOME: "/tmp/clawjs-bridge-home",
    CLAW_REMOTE_EXPOSURE: "remote",
    CLAW_REMOTE_ENABLE_BONJOUR: "1",
  });
  assert.equal(enabled.bonjourEnabled, true);
});

test("loadConfig requires positive Iroh enable and preserves legacy disable override", () => {
  const loopback = loadConfig({
    HOME: "/tmp/clawjs-bridge-home",
    CLAW_REMOTE_ENABLE_IROH: "1",
  });
  assert.equal(loopback.iroh?.enabled, false);

  const enabled = loadConfig({
    HOME: "/tmp/clawjs-bridge-home",
    CLAW_REMOTE_EXPOSURE: "remote",
    CLAW_REMOTE_ENABLE_IROH: "1",
    CLAW_REMOTE_IROH_RELAY_URL: "https://relay.example",
  });

  assert.equal(enabled.iroh?.enabled, true);
  assert.equal(enabled.iroh?.relayUrl, "https://relay.example");

  const disabled = loadConfig({
    HOME: "/tmp/clawjs-bridge-home",
    CLAW_REMOTE_EXPOSURE: "remote",
    CLAW_REMOTE_ENABLE_IROH: "1",
    CLAW_REMOTE_IROH_DISABLE: "1",
  });
  assert.equal(disabled.iroh?.enabled, false);
});

test("loadConfig requires positive coordinator enable in remote exposure", () => {
  const config = loadConfig({
    HOME: "/tmp/clawjs-bridge-home",
    CLAW_REMOTE_EXPOSURE: "remote",
    CLAW_REMOTE_ENABLE_COORDINATOR: "1",
    CLAW_REMOTE_COORDINATOR_URL: "https://coordinator.example",
    CLAW_REMOTE_COORDINATOR_TOKEN: "token",
    CLAW_REMOTE_COORDINATOR_DEVICE_ID: "device-1",
    CLAW_REMOTE_COORDINATOR_TENANT_ID: "tenant-1",
  });

  assert.equal(config.coordinator?.baseUrl, "https://coordinator.example");
  assert.equal(config.coordinator?.accessToken, "token");
});

test("loadConfig rejects unknown exposure modes", () => {
  assert.throws(
    () => loadConfig({ HOME: "/tmp/clawjs-bridge-home", CLAW_REMOTE_EXPOSURE: "public" }),
    /invalid exposure mode/,
  );
});
