#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
const Ajv2020Module = require("ajv/dist/2020");
const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
const schemaPath = path.join(rootDir, "docs/governance/system-telemetry/external-approval.schema.json");
const fixturesPath = path.join(rootDir, "docs/governance/system-telemetry/external-approval.fixtures.json");
const SCRIPT_PATH = "scripts/validate-system-telemetry-external-approval.mjs";
const SECRET_TEXT_PATTERNS = [
  /\bBearer\s+([A-Za-z0-9._-]{6,})/gi,
  /\b(sk-[A-Za-z0-9._-]{6,})\b/g,
  /\b(api[_ -]?key|token|secret)\b\s*[:=]\s*([^\s,;]+)/gi,
  /\/Users\/[^/\s"]+/g,
  /(^|[\s":])\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+/g,
];

function usage() {
  return [
    "System telemetry external approval validator",
    "Usage:",
    "  node scripts/validate-system-telemetry-external-approval.mjs <packet.json>",
    "  node scripts/validate-system-telemetry-external-approval.mjs --fixtures",
  ].join("\n");
}

function readJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function fail(code, message, options = {}) {
  console.error(JSON.stringify({
    ok: false,
    status: options.status ?? "FAIL",
    code,
    message: redactSensitiveText(message),
    location: redactSensitiveText(options.location ?? SCRIPT_PATH),
    suggestion: redactSensitiveText(options.suggestion ?? "Fix the named approval packet or fixture before retrying."),
    safeNextStep: redactSensitiveText(options.safeNextStep ?? `Rerun node ${SCRIPT_PATH} after fixing the reported input.`),
    ...(options.details === undefined ? {} : { details: redactSensitiveText(options.details) }),
  }, null, 2));
  process.exit(options.exitCode ?? 1);
}

function redactSensitiveText(value) {
  let redacted = typeof value === "string" ? value : JSON.stringify(value);
  redacted = redacted.replaceAll(SECRET_TEXT_PATTERNS[0], "Bearer [REDACTED]");
  redacted = redacted.replaceAll(SECRET_TEXT_PATTERNS[1], "[REDACTED]");
  redacted = redacted.replaceAll(SECRET_TEXT_PATTERNS[2], (_match, label) => `${label}: [REDACTED]`);
  redacted = redacted.replaceAll(SECRET_TEXT_PATTERNS[3], "~");
  redacted = redacted.replaceAll(SECRET_TEXT_PATTERNS[4], (_match, prefix) => `${prefix}<path>`);
  return redacted;
}

function displayPacketPath(packetPath) {
  const relative = path.relative(rootDir, packetPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  return "<external-packet>";
}

function compileSchema() {
  const schema = readJson(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, validateFormats: false, strict: false });
  return { ajv, validate: ajv.compile(schema) };
}

function assertPublicSafePacket(packet, label) {
  const errors = publicSafetyErrors(packet);
  if (errors.length > 0) {
    fail("system_telemetry_approval_public_safety_failed", `${label}: packet contains non public-safe material`, {
      location: label,
      suggestion: "Remove filesystem paths, raw secret references, keys, or token-like values from the packet.",
      safeNextStep: "Replace sensitive fields with synthetic public-safe references, then rerun the validator.",
      details: errors.join("; "),
    });
  }
}

function publicSafetyErrors(packet) {
  const serialized = JSON.stringify(packet);
  const checks = [
    ["/Users/", "private filesystem path"],
    ["file://", "file URL"],
    ["secret://", "raw secret reference"],
    ["-----BEGIN", "key material marker"],
    ["sk-", "API key-like token"],
    ["AKIA", "cloud access key-like token"],
  ];
  return checks
    .filter(([needle]) => serialized.includes(needle))
    .map(([, label]) => `packet contains ${label}`);
}

function approvalPacketErrors(packet, compiled) {
  const errors = [];
  errors.push(...publicSafetyErrors(packet));
  if (!compiled.validate(packet)) {
    errors.push(`schema: ${compiled.ajv.errorsText(compiled.validate.errors)}`);
  }
  const approvedAt = Date.parse(packet.approval?.approvedAt);
  const expiresAt = Date.parse(packet.approval?.expiresAt);
  if (!Number.isFinite(approvedAt)) {
    errors.push("approval.approvedAt must be a parseable timestamp");
  }
  if (!Number.isFinite(expiresAt)) {
    errors.push("approval.expiresAt must be a parseable timestamp");
  }
  if (Number.isFinite(approvedAt) && Number.isFinite(expiresAt) && expiresAt <= approvedAt) {
    errors.push("approval.expiresAt must be after approval.approvedAt");
  }
  return errors;
}

function mutateTemplate(packet, mutation) {
  const mutated = JSON.parse(JSON.stringify(packet));
  switch (mutation) {
    case "approval.exactRunApproved=false":
      mutated.approval.exactRunApproved = false;
      break;
    case "authorization.networkAccessApproved=false":
      mutated.authorization.networkAccessApproved = false;
      break;
    case "authorization.nativeGrantRefs=[]":
      mutated.authorization.nativeGrantRefs = [];
      break;
    case "authorization.signedHostRefs=[]":
      mutated.authorization.signedHostRefs = [];
      break;
    case "approval.expiresAt=beforeApprovedAt":
      mutated.approval.expiresAt = "2026-05-19T23:59:59Z";
      break;
    case "approval.approvedAt=notTimestamp":
      mutated.approval.approvedAt = "not-a-timestamp";
      break;
    case "approval.approvedActions=extra":
      mutated.approval.approvedActions = [mutated.approval.approvedActions[0], "extra_unapproved_action_template"];
      break;
    case "authorization.credentialLeaseRefs=extra":
      mutated.authorization.credentialLeaseRefs = [mutated.authorization.credentialLeaseRefs[0], "extra_lease_template"];
      break;
    case "authorization.nativeGrantRefs=extra":
      mutated.authorization.nativeGrantRefs = [mutated.authorization.nativeGrantRefs[0], "extra_native_grant_template"];
      break;
    case "authorization.credentialLeaseRefs=rawSecretRef":
      mutated.authorization.credentialLeaseRefs = ["secret://raw-template"];
      break;
    case "closureImpact.externalPendingRows=extra":
      mutated.closureImpact.externalPendingRows = [mutated.laneId, "SYS-TEL-EXT-999"];
      break;
    default:
      fail("system_telemetry_approval_fixture_mutation_unknown", `unknown approval fixture mutation ${mutation}`, {
        location: "docs/governance/system-telemetry/external-approval.fixtures.json",
        suggestion: "Use a known synthetic mutation name or update the validator with a reviewed mutation case.",
        safeNextStep: "Fix the fixture mutation id, then rerun node scripts/validate-system-telemetry-external-approval.mjs --fixtures.",
      });
  }
  return mutated;
}

function validatePacket(packet, label) {
  const compiled = compileSchema();
  const errors = approvalPacketErrors(packet, compiled);
  if (errors.length > 0) {
    fail("system_telemetry_approval_packet_invalid", `${label}: packet does not conform to system telemetry external approval requirements`, {
      location: label,
      suggestion: "Fix schema, timestamps, exact-run approval, authorization refs, and public-safe fields in the packet.",
      safeNextStep: "Update the approval packet, then rerun the validator on the same file.",
      details: errors.join("; "),
    });
  }
  return { laneId: packet.laneId, repoScope: packet.repoScope };
}

function validateFixtures() {
  const fixtures = readJson(fixturesPath);
  if (fixtures.status !== "synthetic_templates_not_approval") {
    fail("system_telemetry_approval_fixtures_status_invalid", "fixtures must remain synthetic approval templates only", {
      location: "docs/governance/system-telemetry/external-approval.fixtures.json#status",
      suggestion: "Keep fixtures synthetic; do not store real approvals in the repository.",
      safeNextStep: "Restore status=synthetic_templates_not_approval, then rerun the fixture validator.",
    });
  }
  const compiled = compileSchema();
  const validSyntheticPackets = fixtures.validSyntheticPackets ?? [];
  const invalidSyntheticPackets = fixtures.invalidSyntheticPackets ?? [];
  const validByLaneId = new Map();
  const accepted = [];
  for (const packet of validSyntheticPackets) {
    const errors = approvalPacketErrors(packet, compiled);
    if (errors.length > 0) {
      fail("system_telemetry_approval_valid_fixture_invalid", `valid fixture ${packet.laneId} did not validate`, {
        location: "docs/governance/system-telemetry/external-approval.fixtures.json#validSyntheticPackets",
        suggestion: "Fix the valid synthetic fixture so it passes schema, authorization, and public-safety checks.",
        safeNextStep: "Update the fixture packet, then rerun node scripts/validate-system-telemetry-external-approval.mjs --fixtures.",
        details: errors.join("; "),
      });
    }
    validByLaneId.set(packet.laneId, packet);
    accepted.push(packet.laneId);
  }
  for (const fixture of invalidSyntheticPackets) {
    const base = validByLaneId.get(fixture.packetRef);
    if (!base) {
      fail("system_telemetry_approval_fixture_ref_missing", `invalid fixture ${fixture.id} references unknown lane ${fixture.packetRef}`, {
        location: "docs/governance/system-telemetry/external-approval.fixtures.json#invalidSyntheticPackets",
        suggestion: "Point packetRef at a valid synthetic fixture laneId.",
        safeNextStep: "Fix the invalid fixture reference, then rerun the fixture validator.",
      });
    }
    const mutated = mutateTemplate(base, fixture.mutation);
    if (approvalPacketErrors(mutated, compiled).length === 0) {
      fail("system_telemetry_approval_invalid_fixture_accepted", `invalid fixture ${fixture.id} unexpectedly validated`, {
        location: "docs/governance/system-telemetry/external-approval.fixtures.json#invalidSyntheticPackets",
        suggestion: "Strengthen the fixture mutation or schema rule so this invalid case fails.",
        safeNextStep: "Fix the invalid fixture expectation, then rerun the fixture validator.",
      });
    }
  }
  return {
    status: fixtures.status,
    validSyntheticPackets: validSyntheticPackets.length,
    invalidSyntheticPackets: invalidSyntheticPackets.length,
    accepted,
  };
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  const packet = { approval: { approvedAt: "notTimestamp", expiresAt: "2026-05-19T00:00:00Z" }, token: "sk-test-secret-123456", path: "/Users/example/private" };
  const errors = approvalPacketErrors(packet, compileSchema());
  const output = JSON.stringify({
    ok: false,
    status: "FAIL",
    code: "system_telemetry_approval_packet_invalid",
    message: redactSensitiveText("/Users/example/private packet invalid sk-test-secret-123456"),
    location: redactSensitiveText("/Users/example/private/packet.json"),
    suggestion: "Fix packet.",
    safeNextStep: "Rerun validator.",
    details: redactSensitiveText(errors.join("; ")),
  });
  if (!output.includes("system_telemetry_approval_packet_invalid")) throw new Error("self-test missing stable code");
  if (!output.includes("suggestion") || !output.includes("safeNextStep")) throw new Error("self-test missing guidance");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  console.log("system telemetry external approval validator self-test passed");
  process.exit(0);
}

if (args.includes("--help")) {
  console.error(usage());
  process.exit(0);
}
if (args.length !== 1) {
  fail("system_telemetry_approval_usage_error", "Expected exactly one packet path or --fixtures.", {
    status: "USAGE",
    location: SCRIPT_PATH,
    suggestion: "Pass one approval packet path, --fixtures, --self-test, or --help.",
    safeNextStep: "Run node scripts/validate-system-telemetry-external-approval.mjs <packet.json>.",
    exitCode: 64,
  });
}

try {
  if (args[0] === "--fixtures") {
    console.log(JSON.stringify({ ok: true, ...validateFixtures() }, null, 2));
  } else {
    const packetPath = path.resolve(process.cwd(), args[0]);
    const result = validatePacket(readJson(packetPath), displayPacketPath(packetPath));
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  }
} catch (error) {
  fail("system_telemetry_approval_read_failed", "Could not read or parse the approval packet or fixtures.", {
    location: args[0] === "--fixtures" ? "docs/governance/system-telemetry/external-approval.fixtures.json" : args[0],
    suggestion: "Pass a readable JSON packet file or repair the synthetic fixtures JSON.",
    safeNextStep: "Fix the JSON file, then rerun the validator.",
    details: error instanceof Error ? error.message : String(error),
  });
}
