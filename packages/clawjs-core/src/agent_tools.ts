// Agent tools surface — the daemon-side registry that exposes typed
// actions to LLM-driven agents (Codex and friends). Lives in clawjs-core
// so every consumer (daemon HTTP server, in-process callers, downstream
// clients like Clawix-Mac and the CLI) shares the same wire types.
//
// Distinct from WorkspaceToolDescriptor (workspace catalog of editorial
// operations) and from tool_invocations (the audit collection that
// records what already ran). This module is the schema and runtime
// envelope a feature uses to publish callable verbs, with parameter
// shapes the LLM can fill in.

/**
 * Severity grade attached to every agent tool. Drives the approval
 * gate: `safe` and `reversible` run without prompting; `sensitive`
 * routes to the inbox queue; `catastrophic` interrupts the user with
 * a blocking confirmation surface. Kept independent from IoTRiskLevel
 * so non-IoT features (database mutations, notes, calendar, ...) can
 * reuse the same vocabulary.
 */
export type AgentToolRiskLevel =
  | "safe"
  | "reversible"
  | "sensitive"
  | "catastrophic";

/**
 * A single LLM-callable verb published by a feature (iot, database,
 * notes, calendar, ...). The `id` is dot-separated (`iot.things.list`)
 * to match the existing WorkspaceToolDescriptor convention.
 *
 * `parameters` is a JSON Schema object describing the call payload, so
 * a runtime can pass it straight to OpenAI / Anthropic function-calling
 * surfaces without translation. Keep parameters small and explicit;
 * leave free-form blobs to dedicated "raw invoke" tools where needed.
 */
export interface AgentToolDescriptor {
  /** Stable dot-separated identifier, e.g. `iot.things.list`. */
  id: string;
  /** Short human title for catalogs and audit UI. */
  title: string;
  /** LLM-facing description. Should read as instructions the model can act on. */
  description: string;
  /** Logical domain the tool belongs to, e.g. `iot`, `database`. */
  domain: string;
  /** Feature package that registered this tool. Used for filtering and audit. */
  sourceFeature: string;
  /**
   * JSON Schema for the arguments object. Pass-through to function-calling.
   * Always an object schema at the top level even when empty.
   */
  parameters: AgentToolParameters;
  /**
   * Effect classification used by the approval gate. Read-only tools
   * are `safe`; tools that mutate or schedule work are `reversible`,
   * `sensitive`, or `catastrophic`. Maps to the IoT severity scale and
   * to the productivity approval gate.
   */
  riskLevel: AgentToolRiskLevel;
  /** Whether invocation is allowed without an explicit approval record. */
  requiresApproval?: boolean;
  /** Optional version hint for clients that pin tool catalogs. */
  version?: string;
}

/**
 * Top-level shape of `parameters` on an AgentToolDescriptor. We accept
 * a loose JSON Schema object — feature packages own their schemas and
 * the registry does not validate at registration time. Runtime callers
 * can plug in ajv or similar if they want stricter checks.
 */
export interface AgentToolParameters {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

/** Invocation payload sent to the daemon. */
export interface AgentToolInvocationRequest {
  /** Identifier of the tool to invoke (matches AgentToolDescriptor.id). */
  id: string;
  /** Arguments object validated against `parameters`. */
  arguments: Record<string, unknown>;
  /** Optional caller correlation id propagated to audit and SSE events. */
  invocationId?: string;
}

/** Result envelope returned by the daemon. Mirrors the standard typed result shape. */
export interface AgentToolInvocationResult {
  /** Whether the call ran to completion without raising. */
  ok: boolean;
  /** Tool-specific return payload. Present iff `ok` is true. */
  value?: unknown;
  /** Failure detail. Present iff `ok` is false. */
  error?: AgentToolInvocationError;
  /** Echo of the caller-provided invocationId for log correlation. */
  invocationId?: string;
  /** Wall-clock duration of the handler in milliseconds. */
  durationMs?: number;
}

export interface AgentToolInvocationError {
  /** Machine-readable code: `not_found`, `invalid_args`, `unauthorized`, `internal`, ... */
  code: string;
  /** Human-readable summary, safe to surface in audit logs. */
  message: string;
  /** Optional structured detail; redact secrets before populating. */
  detail?: Record<string, unknown>;
}

/** Listing payload returned by `/v1/tools/list`-style endpoints. */
export interface AgentToolCatalog {
  /** ISO-8601 timestamp of when the catalog was assembled. */
  generatedAt: string;
  /** Stable enumeration of every tool the daemon currently exposes. */
  tools: AgentToolDescriptor[];
}
