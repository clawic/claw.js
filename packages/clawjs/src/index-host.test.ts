import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";

import { clawHostApiRoutes } from "@clawjs/core";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("host registry CLI registers, selects, and reports the active host", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-cli-"));
  const clawHome = path.join(workspaceRoot, "claw-home");

  const registered = await runCliCapture([
    "host",
    "register",
    "claw",
    "--name",
    "Claw",
    "--kind",
    "standalone",
    "--transport",
    "xpc",
    "--address",
    "com.example.claw.runtime",
    "--claw-home",
    clawHome,
    "--use",
    "--json",
  ], workspaceRoot);

  assert.equal(registered.code, CLI_EXIT_OK, registered.stderr);
  const registeredPayload = JSON.parse(registered.stdout);
  assert.equal(registeredPayload.ok, true);
  assert.equal(registeredPayload.meta.canonicalCommand, "host");
  assert.equal(registeredPayload.meta.jsonSchemaId, "claw.cli.host.v1");
  assert.equal(registeredPayload.meta.subcommand, "register");
  assert.equal(registeredPayload.data.activeHostId, "claw");
  assert.equal(registeredPayload.data.host.endpoint.transport, "xpc");

  const status = await runCliCapture(["host", "status", "--claw-home", clawHome, "--json"], workspaceRoot);
  assert.equal(status.code, CLI_EXIT_OK, status.stderr);
  const statusPayload = JSON.parse(status.stdout);
  assert.equal(statusPayload.ok, true);
  assert.equal(statusPayload.meta.subcommand, "status");
  assert.equal(statusPayload.data.host.id, "claw");

  const listed = await runCliCapture(["host", "list", "--claw-home", clawHome, "--json"], workspaceRoot);
  assert.equal(listed.code, CLI_EXIT_OK, listed.stderr);
  const listPayload = JSON.parse(listed.stdout);
  assert.equal(listPayload.ok, true);
  assert.equal(listPayload.meta.subcommand, "list");
  assert.equal(listPayload.data.hosts.length, 1);
  assert.match(listPayload.data.registryPath, /hosts\/registry\.json$/);
});

test("host registry CLI fails clearly when no active host exists", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-empty-"));
  const status = await runCliCapture(["host", "status", "--claw-home", path.join(workspaceRoot, "claw-home"), "--json"], workspaceRoot);

  assert.equal(status.code, CLI_EXIT_DEGRADED);
  const payload = JSON.parse(status.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "host_unavailable");
  assert.equal(payload.meta.canonicalCommand, "host");
  assert.equal(payload.meta.subcommand, "status");
});

test("host registry CLI returns JSON usage errors for unknown host subcommands", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-unknown-json-"));
  const clawHome = path.join(workspaceRoot, "claw-home");

  const result = await runCliCapture(["host", "definitely_missing", "--claw-home", clawHome, "--json"], workspaceRoot);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_host_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.host.subcommand");
  assert.equal(payload.error.details.received, "definitely_missing");
  assert.equal(payload.error.details.validSubcommands.includes("list"), true);
  assert.equal(payload.error.details.validSubcommands.includes("domains"), true);
  assert.match(payload.error.safeNextStep, /claw host list --json/);
  assert.match(payload.error.safeNextStep, /claw help host --json/);
  assert.equal(payload.meta.canonicalCommand, "host");
  assert.equal(payload.meta.subcommand, "definitely_missing");
});

test("host registry CLI preserves text usage for unknown host subcommands", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-unknown-text-"));

  const result = await runCliCapture(["host", "definitely_missing"], workspaceRoot);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Usage: claw host list|register|use|status\n");
});

test("host registry CLI reports missing active host ids without internal errors", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-use-missing-"));
  const clawHome = path.join(workspaceRoot, "claw-home");

  const result = await runCliCapture(["host", "use", "missing-host", "--claw-home", clawHome, "--json"], workspaceRoot);

  assert.equal(result.code, CLI_EXIT_DEGRADED);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "host_unavailable");
  assert.equal(payload.error.status, "DEGRADED");
  assert.equal(payload.meta.canonicalCommand, "host");
  assert.equal(payload.meta.subcommand, "use");
});

test("direct domain CLI returns actionable host transport errors", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-xpc-"));
  const clawHome = path.join(workspaceRoot, "claw-home");
  await runCliCapture([
    "host",
    "register",
    "native-host",
    "--name",
    "Native Host",
    "--kind",
    "standalone",
    "--transport",
    "xpc",
    "--address",
    "com.example.claw.runtime",
    "--claw-home",
    clawHome,
    "--use",
  ], workspaceRoot);

  const result = await runCliCapture(["contacts", "list", "--claw-home", clawHome, "--json"], workspaceRoot);
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "host_transport_unsupported");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "host:native-host");
  assert.match(payload.error.suggestion, /active host registration/);
  assert.match(payload.error.safeNextStep, /claw host status --json/);
});

test("direct domain CLI forwards v1 requests to the active host", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-forward-"));
  const clawHome = path.join(workspaceRoot, "claw-home");
  const requests: unknown[] = [];
  const server = http.createServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, clawHostApiRoutes.commands);
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push(payload);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        schemaVersion: 1,
        requestId: payload.requestId,
        ok: true,
        data: { received: `${payload.domain}.${payload.resource}.${payload.action}` },
        meta: {
          hostId: "test-host",
          riskLevel: "read",
          validationMode: "host_real",
          durationMs: 1,
        },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    await runCliCapture([
      "host",
      "register",
      "test-host",
      "--name",
      "Test Host",
      "--kind",
      "embedded",
      "--transport",
      "http",
      "--address",
      `http://127.0.0.1:${address.port}`,
      "--claw-home",
      clawHome,
      "--use",
    ], workspaceRoot);

    const forwarded = await runCliCapture(["contacts", "list", "--claw-home", clawHome, "--json"], workspaceRoot);
    assert.equal(forwarded.code, CLI_EXIT_OK, forwarded.stderr);
    const response = JSON.parse(forwarded.stdout);
    assert.equal(response.ok, true);
    assert.equal(response.meta.canonicalCommand, "host");
    assert.equal(response.meta.subcommand, "contacts contacts list");
    assert.equal(response.meta.host.hostId, "test-host");
    assert.equal(response.data.received, "contacts.contacts.list");
    assert.equal((requests[0] as { domain: string }).domain, "contacts");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("direct domain CLI preserves actionable host command error envelopes", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-error-"));
  const clawHome = path.join(workspaceRoot, "claw-home");
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        schemaVersion: 1,
        requestId: payload.requestId,
        ok: false,
        error: { code: "host_permission_missing", message: "Permission grant is missing." },
        meta: { hostId: "test-host", riskLevel: "read", validationMode: "host_real", durationMs: 1 },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    await runCliCapture([
      "host",
      "register",
      "test-host",
      "--name",
      "Test Host",
      "--kind",
      "embedded",
      "--transport",
      "http",
      "--address",
      `http://127.0.0.1:${address.port}`,
      "--claw-home",
      clawHome,
      "--use",
    ], workspaceRoot);

    const result = await runCliCapture(["contacts", "list", "--claw-home", clawHome, "--json"], workspaceRoot);
    assert.equal(result.code, CLI_EXIT_FAILURE);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "host_permission_missing");
    assert.equal(payload.error.status, "FAIL");
    assert.equal(payload.error.location, "host:test-host");
    assert.match(payload.error.suggestion, /host response error/);
    assert.match(payload.error.safeNextStep, /retry the same command/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("system capabilities CLI uses the active host contract", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-system-"));
  const clawHome = path.join(workspaceRoot, "claw-home");
  let requestPayload: Record<string, unknown> | null = null;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      requestPayload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.end(JSON.stringify({
        schemaVersion: 1,
        requestId: requestPayload?.["requestId"],
        ok: true,
        data: [{ id: "calendar.read" }],
        meta: { hostId: "test-host", riskLevel: "read", validationMode: "host_real", durationMs: 1 },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    await runCliCapture([
      "host", "register", "test-host",
      "--name", "Test Host",
      "--kind", "embedded",
      "--transport", "http",
      "--address", `http://127.0.0.1:${address.port}`,
      "--claw-home", clawHome,
      "--use",
    ], workspaceRoot);

    const result = await runCliCapture(["system", "capabilities", "list", "--claw-home", clawHome, "--json"], workspaceRoot);
    assert.equal(result.code, CLI_EXIT_OK, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.meta.canonicalCommand, "host");
    assert.equal(payload.meta.subcommand, "system capabilities list");
    assert.deepEqual(payload.data, [{ id: "calendar.read" }]);
    assert.ok(requestPayload);
    const capturedRequest = requestPayload as { domain: string; resource: string; action: string };
    assert.equal(capturedRequest.domain, "system");
    assert.equal(capturedRequest.resource, "capabilities");
    assert.equal(capturedRequest.action, "list");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
