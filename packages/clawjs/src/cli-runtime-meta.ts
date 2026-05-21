import type { ActorContext, ActorKind, GuidanceHint, GuidanceMatchInput, GuidanceRecord, RuntimeAdapterId } from "@clawjs/core";

import type { CliJsonMeta } from "./cli-json.ts";
import { setCliJsonMetaProvider } from "./cli-json.ts";

type GuidanceMode = "off" | "compact" | "full" | "minimal";
type TrustedActorAssertionKey = {
  keyId: string;
  publicKeyPem: string;
  trustSource: "signed-host" | "agent-runtime";
  issuer?: string;
};

async function resolveCliActor(flags: Record<string, string>, env: NodeJS.ProcessEnv = process.env): Promise<ActorContext> {
  const trustedKeys = parseTrustedKeys(flags["actor-trusted-keys"] || env.CLAW_ACTOR_TRUSTED_KEYS);
  if (flags["actor-trusted-key"]) {
    trustedKeys.push({
      keyId: flags["actor-key-id"] || "cli",
      publicKeyPem: flags["actor-trusted-key"],
      trustSource: (flags["actor-trust-source"] as "signed-host" | "agent-runtime" | undefined) ?? "agent-runtime",
      issuer: flags["actor-issuer"],
    });
  }
  const assertion = flags["actor-assertion"] || env.CLAW_ACTOR_ASSERTION;
  if (assertion) {
    const { verifyActorAssertion } = await import("@clawjs/claw");
    return verifyActorAssertion({
      assertion,
      trustedKeys,
      requiredScope: flags["actor-scope"],
    }).actor;
  }
  if (flags["actor-kind"] || env.CLAW_ACTOR_KIND) {
    return {
      actorKind: parseActorKind(flags["actor-kind"] || env.CLAW_ACTOR_KIND),
      actorId: flags["actor-id"] || env.CLAW_ACTOR_ID,
      sessionId: flags["actor-session-id"] || env.CLAW_ACTOR_SESSION_ID,
      runId: flags["actor-run-id"] || env.CLAW_ACTOR_RUN_ID,
      hostId: flags["actor-host-id"] || env.CLAW_ACTOR_HOST_ID,
      scope: [],
      trustSource: "untrusted",
      verified: false,
      reason: "untrusted_actor_hint",
    };
  }
  return {
    actorKind: "unknown",
    scope: [],
    trustSource: "unknown",
    verified: false,
    reason: "missing_assertion",
  };
}

function resolveGuidanceMode(flags: Record<string, string>): GuidanceMode {
  const explicit = flags.guidance as GuidanceMode | undefined;
  if (explicit === "off" || explicit === "compact" || explicit === "full" || explicit === "minimal") return explicit;
  return "off";
}

function buildCliRuntimeMeta(input: {
  actor: ActorContext;
  guidanceMode: GuidanceMode;
  hints: GuidanceHint[];
  fullRecords?: GuidanceRecord[];
}): CliJsonMeta {
  return {
    actor: input.actor,
    ...(input.guidanceMode === "off" ? {} : { guidance: input.hints }),
    ...(input.guidanceMode === "full" && input.fullRecords ? { guidanceRecords: input.fullRecords } : {}),
  };
}

export async function installCliRuntimeMetaProvider(input: {
  group?: string;
  command?: string;
  subcommand?: string;
  argv: string[];
  flags: Record<string, string>;
  cwd: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<void> {
  const actor = await resolveCliActor(input.flags);
  const guidanceMode = resolveGuidanceMode(input.flags);
  let hints: GuidanceHint[] = [];
  let fullRecords: GuidanceRecord[] = [];
  if (guidanceMode !== "off") {
    try {
      const { createCliClaw } = await import("./cli-claw-factory.ts");
      const claw = await createCliClaw(input.runtimeAdapterId, input.flags, input.workspaceRoot, input.appId, input.workspaceId, input.agentId, input.argv);
      const match = claw.guidance.match({
        ...guidanceMatchInputForCli({
          group: input.group,
          command: input.command,
          subcommand: input.subcommand,
          argv: input.argv,
          flags: input.flags,
          cwd: input.cwd,
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          actor,
        }),
        limit: 5,
      }) as { hints: GuidanceHint[] };
      hints = filterHintsForMode(match.hints, guidanceMode);
      if (guidanceMode === "full") {
        fullRecords = match.hints.map((hint) => claw.guidance.show(hint.id)).filter(Boolean) as GuidanceRecord[];
      }
    } catch {
      hints = [];
      fullRecords = [];
    }
  }
  setCliJsonMetaProvider(() => buildCliRuntimeMeta({ actor, guidanceMode, hints, fullRecords }));
}

function guidanceMatchInputForCli(input: {
  group?: string;
  command?: string;
  subcommand?: string;
  argv: string[];
  flags: Record<string, string>;
  cwd: string;
  workspaceId: string;
  agentId: string;
  actor: ActorContext;
}): GuidanceMatchInput {
  const commandParts = [input.group, input.command, input.subcommand].filter(Boolean);
  return {
    command: commandParts.join(" "),
    flags: Object.keys(input.flags).map((flag) => `--${flag}`),
    args: input.argv.filter((arg) => !arg.startsWith("--")),
    cwd: input.cwd,
    domain: input.flags.domain,
    service: input.flags.service,
    hostname: input.flags.hostname || hostFromUrl(input.flags.url),
    url: input.flags.url,
    secretRef: input.flags["secret-ref"],
    resourceIds: splitCsv(input.flags.resource || input.flags.resources),
    project: input.flags.project,
    workspace: input.flags.workspace || input.workspaceId,
    agent: input.flags.agent || input.agentId,
    actorKind: input.actor.actorKind,
    riskClass: input.flags["risk-class"] as GuidanceMatchInput["riskClass"],
  };
}

function filterHintsForMode(hints: GuidanceHint[], mode: GuidanceMode): GuidanceHint[] {
  if (mode === "off") return [];
  if (mode === "minimal") return hints.filter((hint) => hint.severity === "critical").slice(0, 1);
  return hints;
}

function parseTrustedKeys(value: string | undefined): TrustedActorAssertionKey[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseActorKind(value: string | undefined): ActorKind {
  return value === "human" || value === "agent" || value === "automation" ? value : "unknown";
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function hostFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}
