import { afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { startIotServer } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const servers: Array<Awaited<ReturnType<typeof startIotServer>>> = [];
let iotDistCli = "";
let clawBin = "";

before(async () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  await execFileAsync("npm", ["run", "build"], { cwd: process.cwd() });
  await execFileAsync("npm", ["run", "build:packages"], { cwd: repoRoot });
  iotDistCli = path.join(process.cwd(), "dist", "cli.js");
  clawBin = path.join(repoRoot, "packages", "clawjs", "bin", "clawjs.mjs");
});

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startIotServer("iot-cli");
  servers.push(server);
  return server;
}

test("dedicated CLI and claw bridge hit the same iot service", async () => {
  const server = await boot();

  const scene = await execFileAsync("node", [
    iotDistCli,
    "scenes",
    "activate",
    "scene_focus",
    "--url",
    server.baseUrl,
    "--json",
  ], { cwd: process.cwd() });
  const scenePayload = JSON.parse(scene.stdout) as { result: { scene: { id: string } } };
  assert.equal(scenePayload.result.scene.id, "scene_focus");

  const listed = await execFileAsync("node", [
    clawBin,
    "iot",
    "state",
    "get",
    "--url",
    server.baseUrl,
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
    env: {
      ...process.env,
      CLAW_IOT_DIR: process.cwd(),
    },
  });
  const listedPayload = JSON.parse(listed.stdout) as {
    snapshot: {
      things: Array<{ id: string; capabilities: Array<{ key: string; observedValue: unknown }> }>;
    };
  };
  const officeLight = listedPayload.snapshot.things.find((thing) => thing.id === "office-light");
  assert.equal(officeLight?.capabilities.find((capability) => capability.key === "power")?.observedValue, true);
});
