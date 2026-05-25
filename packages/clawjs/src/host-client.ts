import { spawn } from "child_process";
import http from "http";
import https from "https";
import net from "net";

import {
  clawCommandResponseSchema,
  clawHostApiRoutes,
  type ClawCommandRequest,
  type ClawCommandResponse,
  type ClawHostDescriptor,
} from "@clawjs/core";

export class HostClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function sendHostCommand(host: ClawHostDescriptor, request: ClawCommandRequest): Promise<ClawCommandResponse> {
  if (!host.endpoint) {
    throw new HostClientError("host_endpoint_missing", `Host ${host.id} has no endpoint configured.`);
  }

  switch (host.endpoint.transport) {
  case "unix_socket":
    return sendUnixSocketCommand(host.endpoint.address, request);
  case "http":
    return sendHttpCommand(host.endpoint.address, request);
  case "stdio":
    return sendStdioCommand(host.endpoint.address || host.executablePath, request);
  case "xpc":
    throw new HostClientError(
      "host_transport_unsupported",
      `Host ${host.id} uses XPC, which must be reached through the signed native host. Register a unix_socket/http endpoint for CLI forwarding.`,
    );
  }
}

async function sendUnixSocketCommand(socketPath: string, request: ClawCommandRequest): Promise<ClawCommandResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const chunks: Buffer[] = [];
    socket.setTimeout(10_000);
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
      socket.end();
    });
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new HostClientError("host_timeout", `Timed out waiting for host socket ${socketPath}.`));
    });
    socket.on("error", (error) => {
      reject(new HostClientError("host_unreachable", error.message));
    });
    socket.on("end", () => {
      try {
        resolve(parseHostResponse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function sendHttpCommand(address: string, request: ClawCommandRequest): Promise<ClawCommandResponse> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new HostClientError("host_endpoint_invalid", `Host HTTP endpoint ${address} is not a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HostClientError("host_endpoint_invalid", `Host HTTP endpoint ${address} must use http or https.`);
  }
  if (url.username || url.password) {
    throw new HostClientError("host_endpoint_invalid", "Host HTTP endpoints must not include credentials.");
  }
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = clawHostApiRoutes.commands;
  }
  const client = url.protocol === "https:" ? https : http;
  const payload = JSON.stringify(request);

  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
      timeout: 10_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        try {
          resolve(parseHostResponse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new HostClientError("host_timeout", `Timed out waiting for host ${address}.`));
    });
    req.on("error", (error) => reject(new HostClientError("host_unreachable", error.message)));
    req.end(payload);
  });
}

async function sendStdioCommand(executablePath: string | undefined, request: ClawCommandRequest): Promise<ClawCommandResponse> {
  if (!executablePath) {
    throw new HostClientError("host_endpoint_missing", "stdio host endpoint requires an executable path.");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, [], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new HostClientError("host_timeout", `Timed out waiting for host ${executablePath}.`));
    }, 10_000);

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new HostClientError("host_unreachable", error.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && stdout.length === 0) {
        reject(new HostClientError("host_failed", Buffer.concat(stderr).toString("utf8").trim() || `Host exited with ${code}.`));
        return;
      }
      try {
        resolve(parseHostResponse(Buffer.concat(stdout).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

function parseHostResponse(raw: string): ClawCommandResponse {
  const trimmed = raw.trim();
  if (!trimmed) throw new HostClientError("host_invalid_response", "Host returned an empty response.");
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(firstLine);
  } catch {
    throw new HostClientError("host_invalid_response", "Host returned invalid JSON.");
  }
  try {
    return clawCommandResponseSchema.parse(parsed);
  } catch {
    throw new HostClientError("host_invalid_response", "Host response did not match the command protocol.");
  }
}
