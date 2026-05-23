import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  clawDefaultStreamingBackpressurePolicy,
  clawPersistentSurfaceRegistry,
  clawStreamingBackpressurePolicyId,
} from "../packages/clawjs-core/src/catalogs.ts";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const streamingTransportPattern = /\b(stream|streaming|sse|websocket|ipc|stdout events?|session events?)\b/i;

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function transportRequiresPolicy(transport) {
  return streamingTransportPattern.test(transport ?? "");
}

export function validateStreamingBackpressureContract(registry = clawPersistentSurfaceRegistry) {
  const errors = [];
  const policy = clawDefaultStreamingBackpressurePolicy;
  if (policy.id !== clawStreamingBackpressurePolicyId) errors.push("default policy id drifted");
  if (policy.maxFrameBytes !== 65_536) errors.push("default maxFrameBytes must be 65536");
  if (policy.maxQueuedFrames !== 256) errors.push("default maxQueuedFrames must be 256");
  if (policy.maxQueuedBytes !== 16_777_216) errors.push("default maxQueuedBytes must be 16777216");
  if (policy.bufferPolicy !== "bounded_queue_close_slow_consumer") errors.push("bufferPolicy must close bounded slow consumers");
  if (policy.cancellation !== "abort_signal_required") errors.push("cancellation must require AbortSignal semantics");
  if (policy.persistence !== "incremental_deltas_no_full_transcript_buffer") errors.push("persistence must be incremental");

  for (const edge of registry.edges ?? []) {
    if (transportRequiresPolicy(edge.transport) && edge.streamingPolicyId !== clawStreamingBackpressurePolicyId) {
      errors.push(`${edge.id} transport requires ${clawStreamingBackpressurePolicyId}`);
    }
  }

  for (const route of registry.routes ?? []) {
    const routeRequiresPolicy = transportRequiresPolicy(route.transport)
      || (route.steps ?? []).some((step) => transportRequiresPolicy(step.transport));
    if (routeRequiresPolicy && route.streamingPolicyId !== clawStreamingBackpressurePolicyId) {
      errors.push(`${route.id} route requires ${clawStreamingBackpressurePolicyId}`);
    }
    for (const [index, step] of (route.steps ?? []).entries()) {
      if (transportRequiresPolicy(step.transport) && step.streamingPolicyId !== clawStreamingBackpressurePolicyId) {
        errors.push(`${route.id}.steps[${index}] requires ${clawStreamingBackpressurePolicyId}`);
      }
    }
  }

  const requiredSnippets = [
    ["docs/adr/0042-streaming-backpressure-contract.md", ["Status: Accepted", "P0", "max frame", "AbortSignal"]],
    ["docs/decision-map.md", ["Streaming Backpressure", "scripts/streaming-backpressure-contract-check.mjs"]],
    ["docs/discoverability.registry.json", ["adr:streaming-backpressure-contract", "0042-streaming-backpressure-contract"]],
    ["docs/adr-operational-coverage.manifest.json", ["0042-streaming-backpressure-contract", "streaming-backpressure-contract-check.mjs"]],
  ];
  for (const [relativePath, snippets] of requiredSnippets) {
    if (!exists(relativePath)) {
      errors.push(`missing ${relativePath}`);
      continue;
    }
    const text = read(relativePath);
    for (const snippet of snippets) {
      if (!text.includes(snippet)) errors.push(`${relativePath} missing ${snippet}`);
    }
  }

  return errors;
}

function streamingDiagnostic(error) {
  if (error.includes("transport requires") || error.includes("route requires") || error.includes(".steps[")) {
    return createDiagnostic("streaming_backpressure_policy_missing", error, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Attach the default streaming backpressure policy to every stream, SSE, WebSocket, IPC, stdout-event, or session-event surface.",
      safeNextStep: `Set streamingPolicyId to ${clawStreamingBackpressurePolicyId}, then rerun node --import tsx scripts/streaming-backpressure-contract-check.mjs.`,
    });
  }
  if (error.startsWith("missing ")) {
    const location = error.replace(/^missing /, "");
    return createDiagnostic("streaming_backpressure_required_file_missing", error, {
      location,
      suggestion: "Restore the ADR, decision map, discoverability entry, or operational coverage manifest that documents the streaming contract.",
      safeNextStep: `Add or restore ${location}, then rerun node --import tsx scripts/streaming-backpressure-contract-check.mjs.`,
    });
  }
  if (error.includes(" missing ")) {
    const location = error.split(" missing ")[0];
    return createDiagnostic("streaming_backpressure_required_text_missing", error, {
      location,
      suggestion: "Restore the required streaming backpressure contract text or discoverability hook.",
      safeNextStep: `Update ${location}, then rerun node --import tsx scripts/streaming-backpressure-contract-check.mjs.`,
    });
  }
  return createDiagnostic("streaming_backpressure_contract_invalid", error, {
    location: "packages/clawjs-core/src/catalogs.ts",
    suggestion: "Restore default frame, queue, cancellation, buffer, and persistence policy constants.",
    safeNextStep: "Fix the streaming backpressure policy constant, then rerun node --import tsx scripts/streaming-backpressure-contract-check.mjs.",
  });
}

function printErrors(errors, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "streaming backpressure contract check failed:",
    diagnostics: errors.map(streamingDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const fixture = {
    edges: [{ id: "edge.stream", transport: "SSE stream" }],
    routes: [{ id: "route.websocket", steps: [{ transport: "WebSocket" }] }],
  };
  assert.match(validateStreamingBackpressureContract(fixture).join("\n"), /edge\.stream/);
  fixture.edges[0].streamingPolicyId = clawStreamingBackpressurePolicyId;
  fixture.routes[0].streamingPolicyId = clawStreamingBackpressurePolicyId;
  fixture.routes[0].steps[0].streamingPolicyId = clawStreamingBackpressurePolicyId;
  assert.equal(validateStreamingBackpressureContract(fixture).filter((error) => error.includes("edge.stream") || error.includes("route.websocket")).length, 0);

  const chunks = [];
  printErrors([
    "/Users/example/private edge.stream transport requires claw.streaming.backpressure.default.v1 token sk-test-secret-123456",
    "docs/adr/0042-streaming-backpressure-contract.md missing AbortSignal",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  assert.match(output, /code: streaming_backpressure_policy_missing/);
  assert.match(output, /code: streaming_backpressure_required_text_missing/);
  assert.match(output, /suggestion: Attach the default streaming backpressure policy/);
  assert.match(output, /next: Set streamingPolicyId/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("streaming backpressure contract self-test passed");
  process.exit(0);
}

const errors = validateStreamingBackpressureContract();
if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}

console.log("streaming backpressure contract check passed");
