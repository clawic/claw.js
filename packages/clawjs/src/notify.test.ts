import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCli, CLI_EXIT_OK } from "./index.ts";
import { startNotifyServer } from "../../../notify/tests/e2e/helpers.ts";

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

test("runCli supports notify send and subscription commands", async () => {
  const server = await startNotifyServer("notify-cli");
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-notify-cli-"));
  try {
    const login = await fetch(`${server.baseUrl}/v1/auth/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@notify.local", password: "notify-admin" }),
    });
    const auth = await login.json() as { accessToken: string };
    const adminHeaders = {
      authorization: `Bearer ${auth.accessToken}`,
      "content-type": "application/json",
    };
    const sourceResponse = await fetch(`${server.baseUrl}/v1/source-apps`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        tenantId: "tenant-cli",
        id: "cli-source",
        displayName: "CLI Source",
      }),
    });
    const source = await sourceResponse.json() as { record: { id: string }; token: string };
    await fetch(`${server.baseUrl}/v1/client-apps`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        tenantId: "tenant-cli",
        id: "cli-ios",
        displayName: "CLI iOS",
        platform: "ios",
        bundleId: "com.claw.cli.ios",
      }),
    });
    const installResponse = await fetch(`${server.baseUrl}/v1/client/installations/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: "tenant-cli",
        userId: "user-cli",
        clientAppId: "cli-ios",
        deviceName: "CLI Phone",
      }),
    });
    const installation = await installResponse.json() as { token: string };

    const upsertStdout = captureStream();
    const upsertStderr = captureStream();
    const upsertExit = await runCli([
      "notify",
      "subscriptions",
      "upsert",
      "--runtime",
      "demo",
      "--notify-url",
      server.baseUrl,
      "--notify-client-token",
      installation.token,
      "--source-app-id",
      source.record.id,
      "--agent-id",
      "cli-agent",
    ], {
      stdout: upsertStdout.stream,
      stderr: upsertStderr.stream,
      cwd,
    });
    assert.equal(upsertExit, CLI_EXIT_OK);
    const subscriptionId = upsertStdout.getOutput().trim();
    assert.equal(Boolean(subscriptionId), true);

    const sendStdout = captureStream();
    const sendStderr = captureStream();
    const sendExit = await runCli([
      "notify",
      "send",
      "--runtime",
      "demo",
      "--notify-url",
      server.baseUrl,
      "--notify-source-token",
      source.token,
      "--context-json",
      JSON.stringify({ tenantId: "tenant-cli", agentId: "cli-agent" }),
      "--audience-json",
      JSON.stringify({ useSubscriptions: true }),
      "--delivery-json",
      JSON.stringify({ mode: "alert", title: "CLI alert" }),
    ], {
      stdout: sendStdout.stream,
      stderr: sendStderr.stream,
      cwd,
    });
    assert.equal(sendExit, CLI_EXIT_OK);
    const notificationId = sendStdout.getOutput().trim();
    assert.equal(Boolean(notificationId), true);

    const deleteStdout = captureStream();
    const deleteStderr = captureStream();
    const deleteExit = await runCli([
      "notify",
      "subscriptions",
      "delete",
      subscriptionId,
      "--runtime",
      "demo",
      "--notify-url",
      server.baseUrl,
      "--notify-client-token",
      installation.token,
    ], {
      stdout: deleteStdout.stream,
      stderr: deleteStderr.stream,
      cwd,
    });
    assert.equal(deleteExit, CLI_EXIT_OK);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    await server.close();
  }
});
