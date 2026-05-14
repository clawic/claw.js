import { once } from "node:events";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { runSecretsCli } from "../bin/secrets-commands.mjs";

function captureStream() {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  return { stream, getOutput: () => output };
}

async function createFakeSecretsServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/v1/tenants/demo-tenant/broker/http" && request.method === "POST") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        status: 200,
        headers: { "content-type": "application/json" },
        bodyText: JSON.stringify({ ok: true }),
      }));
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

function secretsArgs(baseUrl: string, workspacePrefix: string) {
  return [
    "--runtime", "demo",
    "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), workspacePrefix)),
    "--secrets-backend", "secrets",
    "--secrets-url", baseUrl,
    "--secrets-token", "secrets-token",
    "--secrets-tenant-id", "demo-tenant",
  ];
}

test("secrets broker CLI requires risk tier and infers explicit declared fields", async () => {
  const secrets = await createFakeSecretsServer();
  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      ...secretsArgs(secrets.baseUrl, "clawjs-secrets-cli-broker-"),
      "secrets", "broker", "http",
      "--url", "https://registry.npmjs.org/-/whoami",
      "--headers-json", JSON.stringify({ Authorization: "Bearer {{npm_token_main.token}}" }),
      "--risk-tier", "read",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /"status": 200/);

    const stderr = captureStream();
    const missingRisk = await runCli([
      ...secretsArgs(secrets.baseUrl, "clawjs-secrets-cli-broker-missing-risk-"),
      "secrets", "broker", "http",
      "--url", "https://registry.npmjs.org/-/whoami",
      "--headers-json", JSON.stringify({ Authorization: "Bearer {{npm_token_main.token}}" }),
    ], {
      stdout: captureStream().stream,
      stderr: stderr.stream,
      cwd: process.cwd(),
    });
    assert.equal(missingRisk, CLI_EXIT_USAGE);
    assert.match(stderr.getOutput(), /--risk-tier is required/);
  } finally {
    await secrets.close();
  }
});

test("public secrets CLI keeps password and recovery phrase commands host-only", async () => {
  const originalLog = console.log;
  const originalError = console.error;
  const output: string[] = [];
  console.log = (...args: unknown[]) => { output.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { output.push(args.join(" ")); };
  try {
    assert.equal(await runSecretsCli(["secrets", "--help"]), 0);
    assert.doesNotMatch(output.join("\n"), /^  secrets (setup|unlock|recover|change-password)\b/m);
    output.length = 0;
    for (const command of ["setup", "unlock", "recover", "change-password"]) {
      assert.equal(await runSecretsCli(["secrets", command]), 1);
    }
    assert.match(output.join("\n"), /signed host UI/);
    assert.doesNotMatch(output.join("\n"), /(Recovery phrase|Master password|New password|Current password):/i);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});
