import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import type { ClawCommandRequest, ClawHostDescriptor } from "@clawjs/core";
import { HostClientError, sendHostCommand } from "./host-client.ts";

function stdioHost(script: string): ClawHostDescriptor {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-client-"));
  const scriptPath = path.join(dir, "host.sh");
  fs.writeFileSync(scriptPath, `#!/bin/sh\n${script}\n`, "utf8");
  fs.chmodSync(scriptPath, 0o755);
  return {
    id: "test-host",
    name: "Test host",
    kind: "standalone",
    endpoint: { transport: "stdio", address: scriptPath },
  } as ClawHostDescriptor;
}

function httpHost(address: string): ClawHostDescriptor {
  return {
    id: "test-host",
    name: "Test host",
    kind: "standalone",
    endpoint: { transport: "http", address },
  } as ClawHostDescriptor;
}

const request = {
  schemaVersion: 1,
  command: "test.echo",
  payload: {},
} as ClawCommandRequest;

test("sendHostCommand reports invalid stdio JSON as a host client error", async () => {
  await assert.rejects(
    () => sendHostCommand(stdioHost("printf '{bad\\n'"), request),
    (error) => {
      assert.equal(error instanceof HostClientError, true);
      assert.equal((error as HostClientError).code, "host_invalid_response");
      assert.match((error as Error).message, /invalid JSON/);
      return true;
    },
  );
});

test("sendHostCommand reports malformed protocol responses as host client errors", async () => {
  await assert.rejects(
    () => sendHostCommand(stdioHost("printf '{}\\n'"), request),
    (error) => {
      assert.equal(error instanceof HostClientError, true);
      assert.equal((error as HostClientError).code, "host_invalid_response");
      assert.match((error as Error).message, /command protocol/);
      return true;
    },
  );
});

test("sendHostCommand rejects non-http host endpoints before connecting", async () => {
  await assert.rejects(
    () => sendHostCommand(httpHost("file:///tmp/claw-host.sock"), request),
    (error) => {
      assert.equal(error instanceof HostClientError, true);
      assert.equal((error as HostClientError).code, "host_endpoint_invalid");
      assert.match((error as Error).message, /must use http or https/);
      return true;
    },
  );
});

test("sendHostCommand rejects http host endpoints with credentials before connecting", async () => {
  await assert.rejects(
    () => sendHostCommand(httpHost("http://user:pass@127.0.0.1:9"), request),
    (error) => {
      assert.equal(error instanceof HostClientError, true);
      assert.equal((error as HostClientError).code, "host_endpoint_invalid");
      assert.match((error as Error).message, /must not include credentials/);
      return true;
    },
  );
});
