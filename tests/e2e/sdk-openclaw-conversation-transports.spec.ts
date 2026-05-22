import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";

import { expect, publicApiRoute, test } from "./fixtures";

const execFileAsync = promisify(execFile);

test("sdk routes OpenClaw sessions by capability and preserves native gateway access", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-openclaw-transports-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const gatewayStatePath = path.join(tempRoot, "gateway-state.json");
  const binaryPath = path.join(tempRoot, "bin", "custom-openclaw");
  const moduleUrl = pathToFileURL(path.join(rootDir, "packages", "clawjs-node", "dist", "index.js")).href;

  fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(gatewayStatePath, JSON.stringify({ calls: [] }, null, 2));
  fs.writeFileSync(binaryPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const gatewayStatePath = ${JSON.stringify(gatewayStatePath)};

function readState() {
  return JSON.parse(fs.readFileSync(gatewayStatePath, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(gatewayStatePath, JSON.stringify(state, null, 2));
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

if (args[0] === "--version") {
  process.stdout.write("openclaw 9.9.9\\n");
  process.exit(0);
}

if (args[0] === "models" && args[1] === "status") {
  process.stdout.write(JSON.stringify({
    defaultModel: "openai/gpt-5.4",
    auth: {
      missingProvidersInUse: [],
      providers: [{ provider: "openai", effective: { kind: "apiKey" }, profiles: { apiKey: 1 } }],
    },
  }) + "\\n");
  process.exit(0);
}

if (args[0] === "agents" && args[1] === "list") {
  process.stdout.write("[]\\n");
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "list") {
  process.stdout.write('{"plugins":[],"diagnostics":[]}\\n');
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "call") {
  const method = args[args.length - 1];
  const params = JSON.parse(readFlag("--params") || "{}");
  const state = readState();
  state.calls.push({ method, params });
  writeState(state);

  switch (method) {
    case "sessions.list":
      process.stdout.write(JSON.stringify({
        sessions: [{ sessionKey: "alpha", title: "Native Alpha" }],
      }) + "\\n");
      process.exit(0);
    case "chat.history":
      process.stdout.write(JSON.stringify({
        sessionKey: params.sessionKey || "alpha",
        messages: [{ role: "assistant", content: "native-history" }],
      }) + "\\n");
      process.exit(0);
    case "chat.send":
      process.stdout.write(JSON.stringify({
        accepted: true,
        sessionKey: params.sessionKey || "alpha",
      }) + "\\n");
      process.exit(0);
    default:
      process.stdout.write(JSON.stringify({ ok: true, method, params }) + "\\n");
      process.exit(0);
  }
}

process.stdout.write("{}\\n");
process.exit(0);
`, { mode: 0o755 });

  const script = `
import fs from "fs";

const { Claw } = await import(${JSON.stringify(moduleUrl)});

const responseBodies = [];
const chatBodies = [];

function textFromResponseInput(input) {
  return (Array.isArray(input) ? input : [])
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .map((item) => typeof item.text === "string" ? item.text : "")
    .join(" ");
}

function responseTextFor(input) {
  const flattened = textFromResponseInput(input).toLowerCase();
  if (flattened.includes("fallback plain text request")) {
    return null;
  }
  if (flattened.includes("inspect the attached files")) {
    return "Reviewed image and pdf";
  }
  return "Budget stream ready";
}

function streamFromEvents(events) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};

  if (href.endsWith(publicApiRoute("claw.api.responses"))) {
    responseBodies.push({ url: href, body });
    const outputText = responseTextFor(body.input);
    if (outputText === null) {
      return new Response("responses unavailable", { status: 503 });
    }
    return new Response(
      streamFromEvents([
        "event: response.output_text.delta\\n" + "data: " + JSON.stringify({ delta: outputText.slice(0, 9) }) + "\\n\\n",
        "event: response.output_text.delta\\n" + "data: " + JSON.stringify({ delta: outputText.slice(9) }) + "\\n\\n",
        "event: response.completed\\n" + "data: " + JSON.stringify({ output_text: outputText }) + "\\n\\n",
      ]),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
        },
      },
    );
  }

  if (href.endsWith(publicApiRoute("claw.api.chatCompletions"))) {
    chatBodies.push({ url: href, body });
    if (body.stream) {
      return new Response(
        streamFromEvents([
          "data: " + JSON.stringify({ choices: [{ delta: { content: "Fallback " } }] }) + "\\n\\n",
          "data: " + JSON.stringify({ choices: [{ delta: { content: "chat reply" } }] }) + "\\n\\n",
          "data: [DONE]\\n\\n",
        ]),
        {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
          },
        },
      );
    }

    return Response.json({
      choices: [{ message: { content: "Budget review" } }],
    });
  }

  throw new Error("Unexpected fetch: " + href);
};

const claw = await Claw({
  runtime: {
    adapter: "openclaw",
    binaryPath: ${JSON.stringify(binaryPath)},
    gateway: {
      url: "http://127.0.0.1:18789",
      token: "test-token",
    },
    env: {
      ...process.env,
      PATH: process.env.PATH || "",
    },
  },
  workspace: {
    appId: "demo",
    workspaceId: "demo-e2e-openclaw-transports",
    agentId: "demo-e2e-openclaw-transports",
    rootDir: ${JSON.stringify(workspaceDir)},
  },
});

const mainSession = claw.sessions.createSession("Budget review");
claw.sessions.appendMessage(mainSession.sessionId, {
  role: "user",
  content: "Review the quarterly budget",
});

const mainEvents = [];
let firstReply = "";
for await (const event of claw.sessions.streamAssistantReplyEvents({
  sessionId: mainSession.sessionId,
  transport: "auto",
})) {
  mainEvents.push(event.type === "transport" ? "transport:" + event.transport + ":" + String(event.fallback) : event.type);
  if (event.type === "chunk") firstReply += event.chunk.delta;
}

const image = await claw.documents.upload({
  name: "chart.png",
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnCYl8AAAAASUVORK5CYII=",
  sessionId: mainSession.sessionId,
});

const pdf = await claw.documents.upload({
  name: "report.pdf",
  mimeType: "application/pdf",
  data: Buffer.from("%PDF-1.4\\n1 0 obj\\n<<>>\\nendobj\\ntrailer\\n<<>>\\n%%EOF\\n").toString("base64"),
  sessionId: mainSession.sessionId,
});

claw.sessions.appendMessage(mainSession.sessionId, {
  role: "user",
  content: "Inspect the attached files",
  documents: [
    {
      documentId: image.documentId,
      name: image.name,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
    },
    {
      documentId: pdf.documentId,
      name: pdf.name,
      mimeType: pdf.mimeType,
      sizeBytes: pdf.sizeBytes,
    },
  ],
});

let attachmentReply = "";
for await (const event of claw.sessions.streamAssistantReplyEvents({
  sessionId: mainSession.sessionId,
  transport: "auto",
})) {
  if (event.type === "chunk") attachmentReply += event.chunk.delta;
}

const generatedTitle = await claw.sessions.generateTitle({
  sessionId: mainSession.sessionId,
  transport: "auto",
});

const fallbackSession = claw.sessions.createSession("Fallback");
claw.sessions.appendMessage(fallbackSession.sessionId, {
  role: "user",
  content: "fallback plain text request",
});

const fallbackEvents = [];
let fallbackReply = "";
for await (const event of claw.sessions.streamAssistantReplyEvents({
  sessionId: fallbackSession.sessionId,
  transport: "auto",
})) {
  fallbackEvents.push(event.type === "transport" ? "transport:" + event.transport + ":" + String(event.fallback) : event.type);
  if (event.type === "chunk") fallbackReply += event.chunk.delta;
}

const nativeList = await claw.runtime.openclaw.sessions.list({ limit: 5 });
const nativeHistory = await claw.runtime.openclaw.chat.history({ sessionKey: "alpha" });
const nativeSend = await claw.runtime.openclaw.chat.send({ sessionKey: "alpha", message: "hello" });
const gatewayState = JSON.parse(fs.readFileSync(${JSON.stringify(gatewayStatePath)}, "utf8"));
const transcript = claw.sessions.getSession(mainSession.sessionId);

process.stdout.write(JSON.stringify({
  firstReply,
  attachmentReply,
  fallbackReply,
  generatedTitle,
  mainEvents,
  fallbackEvents,
  mainMessageCount: transcript?.messageCount ?? 0,
  responseBodies,
  chatBodies,
  nativeList,
  nativeHistory,
  nativeSend,
  gatewayCalls: gatewayState.calls,
}, null, 2));
`;

  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: process.env.PATH || "",
      CI: "1",
    },
  });

  const payload = JSON.parse(stdout) as {
    firstReply: string;
    attachmentReply: string;
    fallbackReply: string;
    generatedTitle: string;
    mainEvents: string[];
    fallbackEvents: string[];
    mainMessageCount: number;
    responseBodies: Array<{
      url: string;
      body: {
        input?: Array<{ content?: Array<{ type?: string }> }>;
      };
    }>;
    chatBodies: Array<{
      url: string;
      body: {
        stream?: boolean;
      };
    }>;
    nativeList: {
      sessions: Array<{ sessionKey: string; title: string }>;
    };
    nativeHistory: {
      messages: Array<{ role: string; content: string }>;
    };
    nativeSend: {
      accepted: boolean;
      sessionKey: string;
    };
    gatewayCalls: Array<{ method: string }>;
  };

  expect(payload.firstReply).toBe("Budget stream ready");
  expect(payload.attachmentReply).toBe("Reviewed image and pdf");
  expect(payload.fallbackReply).toBe("Fallback chat reply");
  expect(payload.generatedTitle).toBe("Budget review");
  expect(payload.mainEvents).toContain("transport:gateway:false");
  expect(payload.fallbackEvents).toContain("transport:gateway:false");
  expect(payload.fallbackEvents).toContain("transport:gateway:true");
  expect(payload.mainMessageCount).toBe(4);
  expect(payload.responseBodies).toHaveLength(3);
  const attachmentRequest = payload.responseBodies[1];
  const attachmentTypes = (attachmentRequest?.body.input ?? [])
    .flatMap((message) => message.content ?? [])
    .map((part) => part.type)
    .filter(Boolean);
  expect(attachmentTypes).toContain("input_image");
  expect(attachmentTypes).toContain("input_file");
  expect(payload.chatBodies).toHaveLength(2);
  expect(payload.chatBodies[0]?.url.endsWith(publicApiRoute("claw.api.chatCompletions"))).toBe(true);
  expect(payload.chatBodies[0]?.body.stream).not.toBe(true);
  expect(payload.chatBodies[1]?.body.stream).toBe(true);
  expect(payload.nativeList.sessions[0]?.sessionKey).toBe("alpha");
  expect(payload.nativeHistory.messages[0]?.content).toBe("native-history");
  expect(payload.nativeSend.accepted).toBe(true);
  expect(payload.gatewayCalls.map((entry) => entry.method)).toEqual(["sessions.list", "chat.history", "chat.send"]);

  await page.setViewportSize({ width: 1280, height: 960 });
  await page.setContent(`
    <main style="font-family: Menlo, Monaco, monospace; padding: 32px; background: linear-gradient(135deg, #f2f6ef 0%, #dbe8f6 100%); min-height: 100vh; color: #10203a;">
      <section style="max-width: 1040px; margin: 0 auto; background: rgba(255,255,255,0.9); border: 1px solid rgba(16,32,58,0.12); border-radius: 24px; padding: 28px; box-shadow: 0 24px 60px rgba(16,32,58,0.12);">
        <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #4d6487;">SDK E2E</p>
        <h1 style="margin: 0 0 20px; font-size: 30px;">OpenClaw Capability Routing</h1>
        <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px;">
          <article style="padding: 16px; border-radius: 18px; background: #0f1f38; color: #f6f5ef;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Primary Chat</p>
            <p style="margin: 0; font-size: 20px;">${payload.firstReply}</p>
          </article>
          <article style="padding: 16px; border-radius: 18px; background: #eaf6ed; color: #0f5132;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Attachments</p>
            <p style="margin: 0; font-size: 20px;">${payload.attachmentReply}</p>
          </article>
          <article style="padding: 16px; border-radius: 18px; background: #fff4db; color: #7c4a00;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Fallback Chat</p>
            <p style="margin: 0; font-size: 20px;">${payload.fallbackReply}</p>
          </article>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px;">
          <article style="padding: 16px; border-radius: 18px; background: #d9e7fb; color: #10203a;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Generated Title</p>
            <p style="margin: 0; font-size: 22px;">${payload.generatedTitle}</p>
          </article>
          <article style="padding: 16px; border-radius: 18px; background: #111827; color: #e5eefc;">
            <p style="margin: 0 0 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72;">Native Gateway Methods</p>
            <p style="margin: 0; font-size: 18px;">${payload.gatewayCalls.map((entry) => entry.method).join(", ")}</p>
          </article>
        </div>
        <pre style="margin: 0; white-space: pre-wrap; border-radius: 18px; background: #0b1220; color: #d8e6fb; padding: 18px; font-size: 13px; line-height: 1.5;">${JSON.stringify({
          mainEvents: payload.mainEvents,
          fallbackEvents: payload.fallbackEvents,
          responseRequests: payload.responseBodies.length,
          chatRequests: payload.chatBodies.length,
          messageCount: payload.mainMessageCount,
        }, null, 2)}</pre>
      </section>
    </main>
  `);

  const screenshotPath = path.join(rootDir, "artifacts", "e2e", "sdk-openclaw-session-transports.png");
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
});
