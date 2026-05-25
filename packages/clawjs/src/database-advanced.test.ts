import assert from "node:assert/strict";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runEmbeddedDatabaseCli } from "./database-advanced.ts";

function captureStream() {
  let output = "";
  return {
    stream: {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    } as NodeJS.WritableStream,
    getOutput() {
      return output;
    },
  };
}

test("embedded database CLI rejects invalid serve ports before listen", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await runEmbeddedDatabaseCli({
    argv: ["serve", "--port", "NaN", "--json"],
    flags: { port: "NaN" },
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(code, CLI_EXIT_USAGE);
  assert.equal(stderr.getOutput(), "");
  const payload = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; message: string; status: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_database_port");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /--port/);
});

test("embedded database CLI reports invalid JSON flags as usage errors", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const code = await runEmbeddedDatabaseCli({
    argv: ["record", "create", "--data", "{nope", "--json"],
    flags: {
      namespace: "demo",
      collection: "items",
      data: "{nope",
    },
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(code, CLI_EXIT_USAGE);
  assert.equal(stderr.getOutput(), "");
  const payload = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; message: string; status: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_database_data_json");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /--data/);
});
