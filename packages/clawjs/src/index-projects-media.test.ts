import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { createClaw, saveAuthStore } from "@clawjs/claw";
import { buildTimeApp } from "../../../time/src/server/app.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE, CLI_USAGE, runCli } from "./index.ts";
import {
  ONE_PIXEL_PNG,
  captureStream,
  createFakeGenerationScript,
  createFakeOpenAIImageCliServer,
  createFakeOpenClawImageSkillEnv,
  createFakeOpenClawToolchain,
  createFakeSecretsCliServer,
  parseCliJsonPayload,
  runCliCapture,
  useIsolatedClawDataRoot,
  withPatchedEnv,
} from "./index-test-utils.ts";

const OPENAI_API_PREFIX = "/v" + "1";
test("runCli generate, add, and info operate on claw projects", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generate-"));

  assert.equal(await runCli(["new", "workspace", "demo-workspace", "--no-install"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);

  const projectRoot = path.join(tempRoot, "demo-workspace");

  const generateStdout = captureStream();
  assert.equal(await runCli(["generate", "skill", "search-intents", "--project", projectRoot, "--json"], {
    stdout: generateStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(generateStdout.getOutput(), /"resource": "skill"/);
  assert.equal(fs.existsSync(path.join(projectRoot, "claw", "skills", "search-intents.ts")), true);

  const addStdout = captureStream();
  assert.equal(await runCli(["add", "telegram", "--project", projectRoot, "--json"], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(addStdout.getOutput(), /"integration": "telegram"/);
  assert.equal(fs.existsSync(path.join(projectRoot, "claw", "channels", "telegram.json")), true);

  const infoStdout = captureStream();
  assert.equal(await runCli(["info", "--project", projectRoot, "--json"], {
    stdout: infoStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(infoStdout.getOutput(), /"projectRoot"/);
  assert.match(infoStdout.getOutput(), /"type": "workspace"/);

  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "claw.project.json"), "utf8"));
  assert.equal(projectConfig.resources.skills[0].id, "search-intents");
  assert.equal(projectConfig.resources.channels[0].id, "telegram");
});

test("runCli exposes provider catalog and auth state commands", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-providers-"));

  const listStdout = captureStream();
  const listExitCode = await runCli([
    "--runtime", "demo",
    "providers",
    "list",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(listExitCode), true);
  assert.match(listStdout.getOutput(), /"id": "openai"/);

  const stateStdout = captureStream();
  const stateExitCode = await runCli([
    "--runtime", "demo",
    "providers",
    "auth-state",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: stateStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(stateExitCode), true);
  assert.match(stateStdout.getOutput(), /"providers"/);
});

test("runCli exposes secrets-backed secrets commands", async () => {
  const secrets = await createFakeSecretsCliServer();
  try {
    const listStdout = captureStream();
    const listExitCode = await runCli([
      "--runtime", "demo",
      "secrets",
      "list",
      "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-secrets-list-")),
      "--secrets-backend", "secrets",
      "--secrets-url", secrets.baseUrl,
      "--secrets-token", "secrets-token",
      "--secrets-tenant-id", "demo-tenant",
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /"npm_token_main"/);

    const typesStdout = captureStream();
    const typesExitCode = await runCli([
      "--runtime", "demo",
      "secrets",
      "types",
      "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-secrets-types-")),
      "--secrets-backend", "secrets",
      "--secrets-url", secrets.baseUrl,
      "--secrets-token", "secrets-token",
      "--secrets-tenant-id", "demo-tenant",
      "--json",
    ], {
      stdout: typesStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(typesExitCode, CLI_EXIT_OK);
    assert.match(typesStdout.getOutput(), /"npm.token"/);

    const capabilitiesStdout = captureStream();
    const capabilitiesExitCode = await runCli([
      "--runtime", "demo",
      "secrets",
      "capabilities",
      "--name", "npm_token_main",
      "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-secrets-capabilities-")),
      "--secrets-backend", "secrets",
      "--secrets-url", secrets.baseUrl,
      "--secrets-token", "secrets-token",
      "--secrets-tenant-id", "demo-tenant",
      "--json",
    ], {
      stdout: capabilitiesStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(capabilitiesExitCode, CLI_EXIT_OK);
    assert.match(capabilitiesStdout.getOutput(), /"capabilities"/);
  } finally {
    await secrets.close();
  }
});

test("runCli manages the host registry", async () => {
  const clawHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-host-registry-"));

  const registerStdout = captureStream();
  const registerExitCode = await runCli([
    "host",
    "register",
    "clawix",
    "--display-name", "Clawix",
    "--kind", "standalone",
    "--transport", "xpc",
    "--address", "com.clawix.host",
    "--claw-home", clawHome,
    "--json",
  ], {
    stdout: registerStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(registerExitCode, CLI_EXIT_OK);
  assert.match(registerStdout.getOutput(), /"activeHostId": "clawix"/);

  const statusStdout = captureStream();
  const statusExitCode = await runCli([
    "host",
    "status",
    "--claw-home", clawHome,
    "--json",
  ], {
    stdout: statusStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(statusExitCode, CLI_EXIT_OK);
  assert.match(statusStdout.getOutput(), /"activeHostId": "clawix"/);
});

test("runCli can upload, search, read, and download documents", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-documents-"));
  const sourceFile = path.join(workspaceRoot, "brief.txt");
  const downloadFile = path.join(workspaceRoot, "downloaded.txt");
  fs.writeFileSync(sourceFile, "alpha notes for document search");

  const uploadStdout = captureStream();
  const uploadExitCode = await runCli([
    "documents",
    "upload",
    "--workspace", workspaceRoot,
    "--file", sourceFile,
    "--json",
  ], {
    stdout: uploadStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(uploadExitCode, CLI_EXIT_OK);
  const uploaded = parseCliJsonPayload<{ documentId: string; name: string }>(uploadStdout.getOutput());
  assert.match(uploaded.documentId, /^[0-9a-f-]{36}$/);
  assert.equal(uploaded.name, "brief.txt");

  const listStdout = captureStream();
  const listExitCode = await runCli([
    "documents",
    "list",
    "--workspace", workspaceRoot,
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(listExitCode, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), new RegExp(uploaded.documentId));

  const searchStdout = captureStream();
  const searchExitCode = await runCli([
    "documents",
    "search",
    "--workspace", workspaceRoot,
    "--query", "alpha",
    "--json",
  ], {
    stdout: searchStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(searchExitCode, CLI_EXIT_OK);
  assert.match(searchStdout.getOutput(), /alpha/);

  const readStdout = captureStream();
  const readExitCode = await runCli([
    "documents",
    "read",
    "--workspace", workspaceRoot,
    "--document-id", uploaded.documentId,
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(readExitCode, CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), /"name": "brief\.txt"/);

  const downloadStdout = captureStream();
  const downloadExitCode = await runCli([
    "documents",
    "download",
    "--workspace", workspaceRoot,
    "--document-id", uploaded.documentId,
    "--out", downloadFile,
    "--confirm",
    "--approval-id", "approval_document_download_index",
    "--legal-label", "Document download - human reviewed",
    "--json",
  ], {
    stdout: downloadStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(downloadExitCode, CLI_EXIT_OK);
  assert.equal(fs.readFileSync(downloadFile, "utf8"), "alpha notes for document search");
  const downloadLegal = JSON.parse(fs.readFileSync(`${downloadFile}.claw-legal.json`, "utf8")) as { approvalId: string; legalLabel: string };
  assert.equal(downloadLegal.approvalId, "approval_document_download_index");
  assert.equal(downloadLegal.legalLabel, "Document download - human reviewed");
});

test("runCli keeps document download outputs inside the workspace", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-documents-output-boundary-"));
  const sourceFile = path.join(workspaceRoot, "brief.txt");
  fs.writeFileSync(sourceFile, "alpha notes for bounded document output");

  const uploadStdout = captureStream();
  const uploadExitCode = await runCli([
    "documents",
    "upload",
    "--workspace", workspaceRoot,
    "--file", sourceFile,
    "--json",
  ], {
    stdout: uploadStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  });
  assert.equal(uploadExitCode, CLI_EXIT_OK);
  const uploaded = parseCliJsonPayload<{ documentId: string }>(uploadStdout.getOutput());

  const escapedFileName = `${path.basename(workspaceRoot)}-escaped.txt`;
  const escapedFile = path.resolve(workspaceRoot, "..", escapedFileName);
  fs.rmSync(escapedFile, { force: true });
  const downloadStdout = captureStream();
  const downloadExitCode = await runCli([
    "documents",
    "download",
    "--workspace", workspaceRoot,
    "--document-id", uploaded.documentId,
    "--out", `../${escapedFileName}`,
    "--confirm",
    "--approval-id", "approval_document_download_boundary",
    "--legal-label", "Document download - human reviewed",
    "--json",
  ], {
    stdout: downloadStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceRoot,
  });
  const payload = JSON.parse(downloadStdout.getOutput()) as { ok: false; error: { code: string; status: string; location: string } };

  assert.equal(downloadExitCode, CLI_EXIT_USAGE);
  assert.equal(payload.error.code, "invalid_document_output_path");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.documents.out");
  assert.equal(fs.existsSync(escapedFile), false);
});

test("runCli reports missing document source files as usage errors", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-documents-missing-source-"));
  const missingFile = path.join(workspaceRoot, "missing.txt");

  for (const command of ["upload", "register"]) {
    const result = await runCliCapture([
      "documents",
      command,
      "--workspace", workspaceRoot,
      "--file", missingFile,
      "--json",
    ], {
      cwd: process.cwd(),
    });
    const payload = JSON.parse(result.stdout) as { ok: false; error: { code: string; status: string; location: string } };

    assert.equal(result.code, CLI_EXIT_USAGE);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "document_source_not_found");
    assert.equal(payload.error.status, "USAGE");
    assert.equal(payload.error.location, "cli.documents.file");
  }
});

test("runCli can generate text through the inference command", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-inference-"));
  const { binDir, openclawLog } = createFakeOpenClawToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_AGENT_TEXT: "hello from inference",
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "inference",
      "generate-text",
      "--workspace", workspaceRoot,
      "--workspace-id", "demo-inference",
      "--agent-id", "demo-inference",
      "--prompt", "Summarize this",
      "--transport", "cli",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /hello from inference/);
  });

  assert.match(fs.readFileSync(openclawLog, "utf8"), /agent --agent demo-inference/);
});

test("runCli can manage TTS config and synthesize audio", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-tts-"));
  const outputPath = path.join(workspaceRoot, "speech.mp3");

  const configStdout = captureStream();
  const configExitCode = await runCli([
    "tts",
    "set-config",
    "--workspace", workspaceRoot,
    "--config-json", JSON.stringify({ provider: "openai", enabled: true, autoRead: true, voice: "nova", model: "tts-1" }),
    "--json",
  ], {
    stdout: configStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(configExitCode, CLI_EXIT_OK);
  assert.match(configStdout.getOutput(), /"provider": "openai"/);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(Buffer.from("fake-mp3"), {
    status: 200,
    headers: { "content-type": "audio/mpeg" },
  })) as typeof fetch;

  try {
    const synthStdout = captureStream();
    const synthExitCode = await runCli([
      "tts",
      "synthesize",
      "--workspace", workspaceRoot,
      "--text", "Hello world",
      "--provider", "openai",
      "--api-key", "test-key",
      "--out", outputPath,
      "--json",
    ], {
      stdout: synthStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(synthExitCode, CLI_EXIT_OK);
    assert.equal(fs.readFileSync(outputPath, "utf8"), "fake-mp3");
    assert.match(synthStdout.getOutput(), /"mimeType": "audio\/mpeg"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli stores and transcribes voice notes locally", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-voice-notes-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const audioPath = path.join(workspaceRoot, "note.ogg");
  const whisperPath = path.join(workspaceRoot, "fake-whisper");
  const ffmpegPath = path.join(workspaceRoot, "fake-ffmpeg");
  fs.writeFileSync(audioPath, "fake-audio");
  fs.writeFileSync(ffmpegPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const input = args[args.indexOf("-i") + 1];
const output = args[args.length - 1];
if (!input || !output.endsWith(".wav")) process.exit(2);
fs.writeFileSync(output, fs.readFileSync(input));
`, { mode: 0o755 });
  fs.writeFileSync(whisperPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const input = args[args.indexOf("-f") + 1];
if (!input.endsWith(".wav")) process.exit(3);
const outIndex = args.indexOf("-of");
if (outIndex !== -1) fs.writeFileSync(args[outIndex + 1] + ".txt", "hola desde nota de voz");
`, { mode: 0o755 });

  const addStdout = captureStream();
  const addExitCode = await runCli([
    "voice-notes",
    "add",
    "--workspace", workspaceRoot,
    "--file", audioPath,
    "--origin", "telegram",
    "--provider", "telegram",
    "--account", "support",
    "--target-id", "1001",
    "--json",
  ], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(addExitCode, CLI_EXIT_OK);
  const note = parseCliJsonPayload<{ id: string; status: string }>(addStdout.getOutput());
  assert.equal(note.status, "stored");

  const transcribeStdout = captureStream();
  const transcribeExitCode = await runCli([
    "voice-notes",
    "transcribe",
    note.id,
    "--workspace", workspaceRoot,
    "--binary-path", whisperPath,
    "--ffmpeg-path", ffmpegPath,
    "--model-path", path.join(workspaceRoot, "model.bin"),
    "--json",
  ], {
    stdout: transcribeStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(transcribeExitCode, CLI_EXIT_OK);
  assert.match(transcribeStdout.getOutput(), /hola desde nota de voz/);

  const listStdout = captureStream();
  const listExitCode = await runCli([
    "voice-notes",
    "list",
    "--workspace", workspaceRoot,
    "--origin", "telegram",
    "--query", "hola",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(listExitCode, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /"status": "transcribed"/);
});

test("runCli honors --runtime for alternate workspace layouts", async () => {
  const zeroWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-zeroclaw-"));
  const picoWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-picoclaw-"));

  const zeroExitCode = await runCli([
    "--runtime", "zeroclaw",
    "workspace", "init",
    "--workspace", zeroWorkspace,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const picoExitCode = await runCli([
    "--runtime", "picoclaw",
    "workspace", "init",
    "--workspace", picoWorkspace,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(zeroExitCode, CLI_EXIT_OK);
  assert.equal(picoExitCode, CLI_EXIT_OK);
  assert.equal(fs.existsSync(path.join(zeroWorkspace, "MEMORY.md")), true);
  assert.equal(fs.existsSync(path.join(zeroWorkspace, "TOOLS.md")), false);
  assert.equal(fs.existsSync(path.join(picoWorkspace, "memory", "MEMORY.md")), true);
  assert.equal(fs.existsSync(path.join(picoWorkspace, "TOOLS.md")), false);
});

test("runCli browser commands target relay browser routes", async () => {
  const requests: Array<{ method: string; url: string; auth: string | undefined; body: string }> = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      auth: req.headers.authorization,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      session: {
        workspaceId: "main",
        active: true,
        status: "ready",
        navigation: {
          title: "Login",
          url: "https://example.com/login",
          displayUrl: "https://example.com/login",
          isLocalUrl: false,
        },
        controller: null,
        viewport: { width: 1440, height: 960 },
        updatedAt: new Date().toISOString(),
      },
      sharePath: "/workspace/demo-tenant/demo-agent/main/browser",
      shareUrl: "http://127.0.0.1:4410/workspace/demo-tenant/demo-agent/main/browser",
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const relayUrl = `http://127.0.0.1:${address.port}`;

  try {
    const stdout = captureStream();
    const ensureExitCode = await runCli([
      "browser",
      "ensure",
      "--relay-url", relayUrl,
      "--access-token", "relay-token",
      "--tenant-id", "demo-tenant",
      "--agent-id", "demo-agent",
      "--workspace-id", "main",
      "--url", "http://localhost:4300",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(ensureExitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /workspace\/demo-tenant\/demo-agent\/main\/browser/);
    assert.equal(requests[0]?.method, "POST");
    assert.equal(requests[0]?.auth, "Bearer relay-token");
    assert.match(requests[0]?.url ?? "", /\/v1\/tenants\/demo-tenant\/agents\/demo-agent\/workspaces\/main\/browser\/session$/);
    assert.match(requests[0]?.body ?? "", /localhost:4300/);

    const statusStdout = captureStream();
    const statusExitCode = await runCli([
      "browser",
      "status",
      "--relay-url", relayUrl,
      "--access-token", "relay-token",
      "--tenant-id", "demo-tenant",
      "--agent-id", "demo-agent",
      "--workspace-id", "main",
    ], {
      stdout: statusStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(statusExitCode, CLI_EXIT_OK);
    assert.equal(statusStdout.getOutput().trim(), "ready");
    assert.equal(requests[1]?.method, "GET");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("runCli supports temporal domain commands and schedule shortcut", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-time-"));
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "data"),
      dbPath: path.join(tmpDir, "data", "core.sqlite"),
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  const timeUrl = address.replace(/\/$/, "");

  try {
    const calendarStdout = captureStream();
    const calendarExitCode = await runCli([
      "calendar",
      "at",
      "monday 9am",
      "review PRs",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: calendarStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(calendarExitCode, CLI_EXIT_OK);
    const calendarCreated = parseCliJsonPayload<{ item: { id: string; kind: string; title: string } }>(calendarStdout.getOutput());
    assert.equal(calendarCreated.item.kind, "event");

    const calendarListStdout = captureStream();
    const calendarListExitCode = await runCli([
      "calendar",
      "list",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: calendarListStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(calendarListExitCode, CLI_EXIT_OK);
    assert.match(calendarListStdout.getOutput().split("\n")[0] ?? "", /id\s+status\s+next\s+title/);
    assert.match(calendarListStdout.getOutput(), /review PRs/);

    const calendarGetStdout = captureStream();
    const calendarGetExitCode = await runCli([
      "calendar",
      "get",
      calendarCreated.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: calendarGetStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(calendarGetExitCode, CLI_EXIT_OK);
    assert.match(calendarGetStdout.getOutput(), /review PRs/);

    const everyStdout = captureStream();
    const everyExitCode = await runCli([
      "routines",
      "every",
      "3h",
      "check deployment health",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: everyStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(everyExitCode, CLI_EXIT_OK);
    const routineCreated = parseCliJsonPayload<{ item: { id: string; kind: string } }>(everyStdout.getOutput());
    assert.equal(routineCreated.item.kind, "routine");

    const runStdout = captureStream();
    const runExitCode = await runCli([
      "routines",
      "run",
      routineCreated.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: runStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(runExitCode, CLI_EXIT_OK);
    assert.match(runStdout.getOutput(), /"status": "succeeded"/);

    const historyStdout = captureStream();
    const historyExitCode = await runCli([
      "routines",
      "history",
      routineCreated.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: historyStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(historyExitCode, CLI_EXIT_OK);
    assert.match(historyStdout.getOutput().split("\n")[0] ?? "", /id\s+status\s+next\s+title/);
    assert.match(historyStdout.getOutput(), /routine executed via workflow/);

    const reminderStdout = captureStream();
    const reminderExitCode = await runCli([
      "reminders",
      "after",
      "30m",
      "check build",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: reminderStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(reminderExitCode, CLI_EXIT_OK);
    assert.match(reminderStdout.getOutput(), /"kind": "reminder"/);

    const watchStdout = captureStream();
    const watchExitCode = await runCli([
      "watch",
      "thread:thread-1",
      "--if-no", "reply",
      "--after",
      "24h",
      "--then", "remind",
      "nudge owner",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--anchor-at", "2026-04-09T08:00:00.000Z",
      "--json",
    ], {
      stdout: watchStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(watchExitCode, CLI_EXIT_OK);
    assert.match(watchStdout.getOutput(), /"kind": "follow_up"/);
    assert.match(watchStdout.getOutput(), /"anchorType": "thread"/);

    const timeFollowUpStdout = captureStream();
    const timeFollowUpExitCode = await runCli([
      "time",
      "create",
      "follow_up",
      "check thread later",
      "--after", "24h",
      "--anchor-type", "thread",
      "--anchor-id", "thread-1",
      "--anchor-at", "2026-04-09T08:00:00.000Z",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: timeFollowUpStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(timeFollowUpExitCode, CLI_EXIT_OK);
    const timeFollowUp = parseCliJsonPayload<{ item: { nextRunAt: string; schedule: { relative: { offsetMs: number } } } }>(timeFollowUpStdout.getOutput());
    assert.equal(timeFollowUp.item.schedule.relative.offsetMs, 24 * 60 * 60 * 1000);
    assert.equal(timeFollowUp.item.nextRunAt, "2026-04-10T08:00:00.000Z");

    const listStdout = captureStream();
    const listExitCode = await runCli([
      "time",
      "list",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /review PRs/);

    const scheduleStdout = captureStream();
    const scheduleExitCode = await runCli([
      "schedule",
      "every",
      "3h",
      "scheduled deployment check",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: scheduleStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(scheduleExitCode, CLI_EXIT_OK);
    assert.match(scheduleStdout.getOutput(), /"kind": "routine"/);
  } finally {
    await built.app.close();
  }
});

test("runCli watch rejects invalid relative durations before persistence", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-watch-invalid-duration-"));
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "data"),
      dbPath: path.join(tmpDir, "data", "core.sqlite"),
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  const timeUrl = address.replace(/\/$/, "");

  try {
    const invalidStdout = captureStream();
    const invalidExitCode = await runCli([
      "watch",
      "thread:thread-1",
      "--if-no", "reply",
      "--after", "nope",
      "--then", "remind",
      "nudge owner",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: invalidStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(invalidExitCode, CLI_EXIT_USAGE);
    const invalidPayload = JSON.parse(invalidStdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(invalidPayload.ok, false);
    assert.equal(invalidPayload.error.code, "invalid_duration");
    assert.equal(invalidPayload.error.status, "USAGE");

    const listStdout = captureStream();
    const listExitCode = await runCli([
      "watch",
      "list",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExitCode, CLI_EXIT_OK);
    const listPayload = parseCliJsonPayload<{ items: unknown[] }>(listStdout.getOutput());
    assert.equal(listPayload.items.length, 0);
  } finally {
    await built.app.close();
  }
});

test("runCli manages local styles, templates, and references", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-design-assets-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-design-cwd-"));
  const context = { stdout: captureStream().stream, stderr: captureStream().stream, cwd };

  const styleOut = captureStream();
  assert.equal(await runCli(["style", "install-builtins", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: styleOut.stream,
  }), CLI_EXIT_OK);
  const stylePayload = parseCliJsonPayload<{ installed: string[]; skipped: string[] }>(styleOut.getOutput());
  assert.equal(stylePayload.installed.includes("claw"), true);
  assert.equal(stylePayload.skipped.length, 0);

  const templateOut = captureStream();
  assert.equal(await runCli(["template", "create", "Launch One Pager", "--category", "one-pager", "--default-style", "claw", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: templateOut.stream,
  }), CLI_EXIT_OK);
  const templatePayload = parseCliJsonPayload<{ template: { id: string; category: string; defaultStyleId: string } }>(templateOut.getOutput());
  assert.equal(templatePayload.template.category, "one-pager");
  assert.equal(templatePayload.template.defaultStyleId, "claw");

  const assetPath = path.join(cwd, "sample.txt");
  fs.writeFileSync(assetPath, "reference body\n", "utf8");
  const refOut = captureStream();
  assert.equal(await runCli(["ref", "add", "--type", "snippet", "--source", "sample.txt", "--name", "Sample Ref", "--tag", "brand,test", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: refOut.stream,
  }), CLI_EXIT_OK);
  const refPayload = parseCliJsonPayload<{ reference: { id: string; asset: string; tags: string[] } }>(refOut.getOutput());
  assert.equal(refPayload.reference.asset, "sample.txt");
  assert.deepEqual(refPayload.reference.tags, ["brand", "test"]);

  const linkedOut = captureStream();
  assert.equal(await runCli(["ref", "link", refPayload.reference.id, "--style", "claw", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: linkedOut.stream,
  }), CLI_EXIT_OK);
  const linkedPayload = parseCliJsonPayload<{ styleIds: string[] }>(linkedOut.getOutput());
  assert.deepEqual(linkedPayload.styleIds, ["claw"]);

  const listOut = captureStream();
  assert.equal(await runCli(["template", "list", "--category", "one-pager", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: listOut.stream,
  }), CLI_EXIT_OK);
  const listPayload = parseCliJsonPayload<{ templates: Array<{ id: string }> }>(listOut.getOutput());
  assert.deepEqual(listPayload.templates.map((entry) => entry.id), [templatePayload.template.id]);

  const renderOut = captureStream();
  assert.equal(await runCli(["template", "render", templatePayload.template.id, "--style", "claw", "--format", "html", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: renderOut.stream,
  }), CLI_EXIT_OK);
  const renderPayload = parseCliJsonPayload<{ results: Array<{ format: string; outputPath: string }> }>(renderOut.getOutput());
  assert.equal(renderPayload.results[0]?.format, "html");
  assert.equal(fs.existsSync(renderPayload.results[0]?.outputPath ?? ""), true);

  const pluralStylesOut = captureStream();
  assert.equal(await runCli(["styles", "list", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: pluralStylesOut.stream,
  }), CLI_EXIT_OK);
  assert.match(pluralStylesOut.getOutput(), /"id": "claw"/);

  const pluralTemplatesOut = captureStream();
  assert.equal(await runCli(["templates", "list", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: pluralTemplatesOut.stream,
  }), CLI_EXIT_OK);
  assert.match(pluralTemplatesOut.getOutput(), new RegExp(templatePayload.template.id));

  const pluralReferencesOut = captureStream();
  assert.equal(await runCli(["references", "list", "--workspace", workspaceRoot, "--json"], {
    ...context,
    stdout: pluralReferencesOut.stream,
  }), CLI_EXIT_OK);
  assert.match(pluralReferencesOut.getOutput(), new RegExp(refPayload.reference.id));
});

test("runCli supports heartbeat routines with deterministic gates", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-heartbeat-"));
  let taskMatches: Array<{ source: string; id: string; title: string; updatedAt: string }> = [];
  let customMatches: Array<{ source: string; id: string; title: string; updatedAt: string }> = [];
  const agentCalls: Array<{ prompt: string; matches: unknown[]; target: string; deliver?: unknown }> = [];
  const built = buildTimeApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(tmpDir, "time-data"),
      dbPath: path.join(tmpDir, "time-data", "core.sqlite"),
      defaultTimeZone: "UTC",
      schedulerIntervalMs: 50,
    },
    heartbeatChecks: {
      "workspace.tasks": async () => taskMatches,
      "custom:ready-check": async () => customMatches,
    },
    heartbeatAgent: async (input) => {
      agentCalls.push({ prompt: input.prompt, matches: input.matches, target: input.target, deliver: input.deliver });
      return { status: "done", summary: `processed ${input.matches.length}` };
    },
  });
  const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
  const timeUrl = address.replace(/\/$/, "");

  const forceDue = (id: string) => {
    const item = built.store.getItem(id);
    assert.ok(item);
    item.nextRunAt = "2026-04-09T08:00:00.000Z";
    built.store.putItem(item);
  };

  try {
    const missingOptInStdout = captureStream();
    const missingOptInStderr = captureStream();
    const missingOptInExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "custom heartbeat",
      "--when", "custom:ready-check",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: missingOptInStdout.stream,
      stderr: missingOptInStderr.stream,
      cwd: process.cwd(),
    });
    assert.equal(missingOptInExitCode, CLI_EXIT_USAGE);
    assert.match(missingOptInStderr.getOutput(), /allow-custom-check/);

    const skipStdout = captureStream();
    const skipExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "triage ready work",
      "--when", "workspace.tasks:new",
      "--prompt", "Work on ready tasks",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: skipStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(skipExitCode, CLI_EXIT_OK);
    const skipRoutine = parseCliJsonPayload<{ item: { id: string; heartbeat?: { when: string[] } } }>(skipStdout.getOutput());
    assert.deepEqual(skipRoutine.item.heartbeat?.when, ["workspace.tasks:new"]);

    const policyStdout = captureStream();
    const policyExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "budgeted heartbeat",
      "--when", "workspace.tasks:new",
      "--target", "main",
      "--cooldown", "30s",
      "--max-wakes", "1",
      "--max-wakes-window", "5m",
      "--active-hours", "00:00-24:00",
      "--active-timezone", "UTC",
      "--stagger", "30s",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: policyStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(policyExitCode, CLI_EXIT_OK);
    const policyRoutine = parseCliJsonPayload<{ item: { schedule?: { staggerMs?: number }; heartbeat?: { target?: string; cooldownMs?: number; maxWakesPerWindow?: { count?: number; windowMs?: number }; activeHours?: { timezone?: string }; staggerMs?: number } } }>(policyStdout.getOutput());
    assert.equal(policyRoutine.item.schedule?.staggerMs, 30_000);
    assert.equal(policyRoutine.item.heartbeat?.target, "main");
    assert.equal(policyRoutine.item.heartbeat?.cooldownMs, 30_000);
    assert.equal(policyRoutine.item.heartbeat?.maxWakesPerWindow?.count, 1);
    assert.equal(policyRoutine.item.heartbeat?.maxWakesPerWindow?.windowMs, 300_000);
    assert.equal(policyRoutine.item.heartbeat?.activeHours?.timezone, "UTC");

    forceDue(skipRoutine.item.id);
    assert.deepEqual(await built.engine.runSchedulerCycle(), []);
    assert.equal(agentCalls.length, 0);

    const skipGetStdout = captureStream();
    const skipGetExitCode = await runCli([
      "routines",
      "get",
      skipRoutine.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: skipGetStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(skipGetExitCode, CLI_EXIT_OK);
    const skipped = parseCliJsonPayload<{ item: { heartbeat?: { state?: { skipCount?: number; lastSkipReason?: string } } } }>(skipGetStdout.getOutput());
    assert.equal(skipped.item.heartbeat?.state?.skipCount, 1);
    assert.equal(skipped.item.heartbeat?.state?.lastSkipReason, "no heartbeat matches");

    taskMatches = [{ source: "workspace.tasks", id: "task-1", title: "Fix release gate", updatedAt: "2026-04-09T08:01:00.000Z" }];
    forceDue(skipRoutine.item.id);
    const wakeExecutions = await built.engine.runSchedulerCycle();
    assert.equal(wakeExecutions.length, 1);
    assert.equal(agentCalls.length, 1);
    assert.equal(agentCalls[0]?.prompt, "Work on ready tasks");
    assert.equal(agentCalls[0]?.target, "isolated");

    const historyStdout = captureStream();
    const historyExitCode = await runCli([
      "routines",
      "history",
      skipRoutine.item.id,
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: historyStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(historyExitCode, CLI_EXIT_OK);
    assert.match(historyStdout.getOutput().split("\n")[0] ?? "", /id\s+status\s+next\s+title/);
    assert.match(historyStdout.getOutput(), /processed 1/);

    taskMatches = [];
    const stopStdout = captureStream();
    const stopExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "stop when empty",
      "--when", "workspace.tasks:new",
      "--stop-when", "workspace.tasks:none",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: stopStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(stopExitCode, CLI_EXIT_OK);
    const stopRoutine = parseCliJsonPayload<{ item: { id: string } }>(stopStdout.getOutput());
    forceDue(stopRoutine.item.id);
    assert.deepEqual(await built.engine.runSchedulerCycle(), []);
    const stopped = built.store.getItem(stopRoutine.item.id);
    assert.equal(stopped?.status, "completed");
    assert.equal(agentCalls.length, 1);

    customMatches = [{ source: "custom", id: "ready-1", title: "Ready check", updatedAt: "2026-04-09T08:02:00.000Z" }];
    const customStdout = captureStream();
    const customExitCode = await runCli([
      "routines",
      "every",
      "5m",
      "custom heartbeat",
      "--when", "custom:ready-check",
      "--allow-custom-check", "ready-check",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
      "--json",
    ], {
      stdout: customStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(customExitCode, CLI_EXIT_OK);
    const customRoutine = parseCliJsonPayload<{ item: { id: string; heartbeat?: { allowedCustomChecks?: string[] } } }>(customStdout.getOutput());
    assert.deepEqual(customRoutine.item.heartbeat?.allowedCustomChecks, ["ready-check"]);

    const listStdout = captureStream();
    const listExitCode = await runCli([
      "routines",
      "list",
      "--time-url", timeUrl,
      "--workspace", tmpDir,
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(listStdout.getOutput().split("\n")[0] ?? "", /id\s+status\s+next\s+title/);
  } finally {
    await built.app.close();
  }
});
