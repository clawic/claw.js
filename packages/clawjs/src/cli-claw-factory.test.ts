import assert from "node:assert/strict";

import type { RuntimeAdapterId } from "@clawjs/core";
import { beforeEach, test, vi } from "vitest";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";

const mocks = vi.hoisted(() => ({
  createClaw: vi.fn(async (options: unknown) => ({ options })),
  createWorkspaceClaw: vi.fn(async (options: unknown) => ({ options })),
}));

vi.mock("@clawjs/claw", () => ({
  createClaw: mocks.createClaw,
}));

vi.mock("@clawjs/workspace", () => ({
  createWorkspaceClaw: mocks.createWorkspaceClaw,
}));

import { createCliClaw, createCliWorkspaceClaw, parseCliGatewayPortFlag } from "./cli-claw-factory.ts";

const runtimeAdapter = "test-runtime" as RuntimeAdapterId;

beforeEach(() => {
  mocks.createClaw.mockClear();
  mocks.createWorkspaceClaw.mockClear();
});

test("parseCliGatewayPortFlag accepts only integer TCP user ports", () => {
  assert.equal(parseCliGatewayPortFlag(undefined), undefined);
  assert.equal(parseCliGatewayPortFlag("1"), 1);
  assert.equal(parseCliGatewayPortFlag(" 24100 "), 24100);
  assert.equal(parseCliGatewayPortFlag("65535"), 65535);

  for (const value of ["", " ", "NaN", "true", "0", "-1", "+3000", "1.5", "65536", "Infinity", "0x50"]) {
    assert.throws(
      () => parseCliGatewayPortFlag(value),
      (error) => {
        assert.equal(error instanceof CliHandledError, true);
        assert.equal((error as CliHandledError).code, "invalid_gateway_port");
        assert.equal((error as CliHandledError).exitCode, CLI_EXIT_USAGE);
        return true;
      },
      value,
    );
  }
});

test("createCliClaw validates gateway port before creating the runtime", async () => {
  await assert.rejects(
    () => createCliClaw(runtimeAdapter, { "gateway-port": "NaN" }, "/workspace", "app", "workspace", "agent"),
    (error) => {
      assert.equal(error instanceof CliHandledError, true);
      assert.equal((error as CliHandledError).code, "invalid_gateway_port");
      return true;
    },
  );

  assert.equal(mocks.createClaw.mock.calls.length, 0);
});

test("createCliWorkspaceClaw validates gateway port before creating the workspace runtime", async () => {
  await assert.rejects(
    () => createCliWorkspaceClaw(runtimeAdapter, { "gateway-port": "1.5" }, "/workspace", "app", "workspace", "agent", "/workspace"),
    (error) => {
      assert.equal(error instanceof CliHandledError, true);
      assert.equal((error as CliHandledError).code, "invalid_gateway_port");
      return true;
    },
  );

  assert.equal(mocks.createWorkspaceClaw.mock.calls.length, 0);
});

test("createCliClaw forwards a valid gateway port as a number", async () => {
  await createCliClaw(runtimeAdapter, { "gateway-port": "24100" }, "/workspace", "app", "workspace", "agent");

  assert.equal(mocks.createClaw.mock.calls.length, 1);
  assert.equal(
    (mocks.createClaw.mock.calls[0]?.[0] as { runtime: { gateway: { port?: number } } }).runtime.gateway.port,
    24100,
  );
});
