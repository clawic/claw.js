import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import type { IotEventEnvelope } from "./realtime.ts";

type RiskLevel = "safe" | "caution" | "restricted";
type ThingKind =
  | "light"
  | "switch"
  | "climate"
  | "cover"
  | "lock"
  | "sensor"
  | "camera"
  | "media"
  | "vacuum"
  | "appliance"
  | "presence"
  | "energy";

export interface HomeRecord {
  id: string;
  label: string;
  isDefault: boolean;
  createdAt: string;
}

export interface AreaRecord {
  id: string;
  homeId: string;
  label: string;
  aliases: string[];
}

export interface ConnectorRecord {
  id: string;
  homeId: string;
  label: string;
  kind: "bridge" | "protocol" | "vendor";
  status: "ready" | "degraded" | "offline";
  capabilities: string[];
}

export interface CapabilityRecord {
  id: string;
  thingId: string;
  key: string;
  label: string;
  writable: boolean;
  readable: boolean;
  unit?: string;
  observedValue: unknown;
  desiredValue: unknown;
  observedAt: string;
}

export interface ThingRecord {
  id: string;
  homeId: string;
  areaId?: string;
  label: string;
  aliases: string[];
  kind: ThingKind;
  risk: RiskLevel;
  connectorId: string;
  targetRef: string;
  metadata?: Record<string, unknown>;
  capabilities: CapabilityRecord[];
}

export interface SceneRecord {
  id: string;
  homeId: string;
  label: string;
  description?: string;
  actions: IoTActionRequest[];
}

export interface AutomationRecord {
  id: string;
  homeId: string;
  label: string;
  enabled: boolean;
  trigger: Record<string, unknown>;
  conditions: Array<Record<string, unknown>>;
  actions: IoTActionRequest[];
}

export interface ApprovalRecord {
  id: string;
  homeId: string;
  status: "pending" | "approved" | "denied" | "executed";
  reason: string;
  action: IoTActionRequest;
  createdAt: string;
  updatedAt: string;
}

export interface IoTActionRequest {
  homeId?: string;
  selector?: string;
  area?: string;
  family?: ThingKind | "scene" | "automation";
  capability?: string;
  action: "on" | "off" | "toggle" | "set" | "open" | "close" | "lock" | "unlock" | "arm" | "disarm" | "start" | "stop" | "pause" | "resume" | "activate";
  value?: unknown;
  targets?: string[];
  metadata?: Record<string, unknown>;
}

export interface PolicyEvaluation {
  decision: "allow" | "approval_required" | "deny" | "ambiguous";
  riskLevel: RiskLevel;
  reasons: string[];
  candidates?: Array<{ id: string; label: string; kind: ThingKind }>;
  resolvedTargetIds?: string[];
}

export interface IoTActionResult {
  status: "executed" | "approval_required" | "ambiguous" | "denied";
  homeId: string;
  decision: PolicyEvaluation["decision"];
  reasons: string[];
  updatedAt: string;
  targets: Array<{ id: string; label: string; kind: ThingKind; areaId?: string }>;
  capabilityUpdates: Array<{ thingId: string; capability: string; observedValue: unknown; desiredValue: unknown }>;
  approvalId?: string;
  candidates?: Array<{ id: string; label: string; kind: ThingKind }>;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function matchesText(query: string, values: string[]): boolean {
  const normalized = normalizeText(query);
  return values.some((value) => normalizeText(value) === normalized || normalizeText(value).includes(normalized));
}

/** Notification fired after `runAction` finishes the synchronous DB
 *  update on the `executed` happy path. App-level wiring uses it to
 *  fan out to the adapter registry so the optimistic SQLite state lines
 *  up with the actual device shortly after. */
export interface ActionExecutedNotice {
  home: HomeRecord;
  request: IoTActionRequest;
  capabilityKey: string;
  targets: ThingRecord[];
  capabilityUpdates: Array<{ thingId: string; capability: string; observedValue: unknown; desiredValue: unknown }>;
  actor: string;
}

export interface CreateThingInput {
  label: string;
  kind: ThingKind;
  connectorId: string;
  targetRef: string;
  areaId?: string;
  aliases?: string[];
  risk?: RiskLevel;
  metadata?: Record<string, unknown>;
  capabilities?: Array<{
    key: string;
    label?: string;
    valueType?: string;
    unit?: string;
    observedValue?: unknown;
    desiredValue?: unknown;
  }>;
}

export class IotServiceStore {
  private readonly db: Database.Database;
  private onEvent?: (event: IotEventEnvelope) => void;
  private onActionExecuted?: (notice: ActionExecutedNotice) => void;

  constructor(
    dbPath: string,
    options: {
      onEvent?: (event: IotEventEnvelope) => void;
      onActionExecuted?: (notice: ActionExecutedNotice) => void;
    } = {},
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.onEvent = options.onEvent;
    this.onActionExecuted = options.onActionExecuted;
    this.initSchema();
    this.seed();
  }

  close(): void {
    this.db.close();
  }

  listHomes(): HomeRecord[] {
    return this.db.prepare(`
      SELECT id, label, is_default, created_at
      FROM homes
      ORDER BY is_default DESC, label ASC
    `).all().map((row) => ({
      id: String((row as Record<string, unknown>).id),
      label: String((row as Record<string, unknown>).label),
      isDefault: Boolean((row as Record<string, unknown>).is_default),
      createdAt: String((row as Record<string, unknown>).created_at),
    }));
  }

  getHome(homeId: string): HomeRecord | null {
    return this.listHomes().find((home) => home.id === homeId) ?? null;
  }

  resolveHome(homeId?: string | null): HomeRecord {
    if (homeId?.trim()) {
      const home = this.getHome(homeId.trim());
      if (!home) throw new Error(`Unknown home ${homeId}`);
      return home;
    }
    const homes = this.listHomes();
    if (homes.length === 1) return homes[0]!;
    const defaultHome = homes.find((entry) => entry.isDefault);
    if (defaultHome) return defaultHome;
    throw new Error("Ambiguous home. Pass --home or homeId explicitly.");
  }

  listAreas(homeId?: string): AreaRecord[] {
    const resolved = this.resolveHome(homeId);
    return this.db.prepare(`
      SELECT id, home_id, label, aliases_json
      FROM areas
      WHERE home_id = ?
      ORDER BY label ASC
    `).all(resolved.id).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      homeId: String((row as Record<string, unknown>).home_id),
      label: String((row as Record<string, unknown>).label),
      aliases: parseJson<string[]>((row as Record<string, string>).aliases_json, []),
    }));
  }

  listConnectors(homeId?: string): ConnectorRecord[] {
    const resolved = this.resolveHome(homeId);
    return this.db.prepare(`
      SELECT id, home_id, label, kind, status, capabilities_json
      FROM connectors
      WHERE home_id = ?
      ORDER BY label ASC
    `).all(resolved.id).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      homeId: String((row as Record<string, unknown>).home_id),
      label: String((row as Record<string, unknown>).label),
      kind: String((row as Record<string, unknown>).kind) as ConnectorRecord["kind"],
      status: String((row as Record<string, unknown>).status) as ConnectorRecord["status"],
      capabilities: parseJson<string[]>((row as Record<string, string>).capabilities_json, []),
    }));
  }

  listThings(homeId?: string, options: { kind?: string; query?: string; area?: string } = {}): ThingRecord[] {
    const resolved = this.resolveHome(homeId);
    const areas = this.listAreas(resolved.id);
    const areaMap = new Map(areas.map((area) => [area.id, area]));
    const rows = this.db.prepare(`
      SELECT id, home_id, area_id, label, aliases_json, kind, risk, connector_id, target_ref, metadata_json
      FROM things
      WHERE home_id = ?
      ORDER BY label ASC
    `).all(resolved.id);
    const things = rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: String(record.id),
        homeId: String(record.home_id),
        ...(record.area_id ? { areaId: String(record.area_id) } : {}),
        label: String(record.label),
        aliases: parseJson<string[]>(record.aliases_json as string | undefined, []),
        kind: String(record.kind) as ThingKind,
        risk: String(record.risk) as RiskLevel,
        connectorId: String(record.connector_id),
        targetRef: String(record.target_ref),
        metadata: parseJson<Record<string, unknown> | undefined>(record.metadata_json as string | undefined, undefined),
        capabilities: this.listCapabilitiesForThing(String(record.id)),
      } satisfies ThingRecord;
    });
    return things.filter((thing) => {
      if (options.kind && thing.kind !== options.kind) return false;
      if (options.area) {
        const area = thing.areaId ? areaMap.get(thing.areaId) : null;
        const areaValues = [thing.areaId ?? "", area?.label ?? "", ...(area?.aliases ?? [])];
        if (!matchesText(options.area, areaValues)) return false;
      }
      if (options.query) {
        const searchValues = [thing.id, thing.label, ...thing.aliases, thing.targetRef];
        if (!matchesText(options.query, searchValues)) return false;
      }
      return true;
    });
  }

  getThing(homeId: string | undefined, thingId: string): ThingRecord | null {
    return this.listThings(homeId).find((thing) => thing.id === thingId) ?? null;
  }

  getStateSnapshot(homeId?: string) {
    const home = this.resolveHome(homeId);
    const areas = this.listAreas(home.id);
    const connectors = this.listConnectors(home.id);
    const things = this.listThings(home.id);
    const updatedAt = this.db.prepare(`
      SELECT MAX(created_at) as updated_at
      FROM events
      WHERE home_id = ?
    `).get(home.id) as Record<string, unknown> | undefined;
    return {
      home,
      areas,
      connectors,
      things,
      updatedAt: String(updatedAt?.updated_at ?? home.createdAt),
    };
  }

  listEvents(homeId?: string, limit = 50): IotEventEnvelope[] {
    const home = this.resolveHome(homeId);
    return this.db.prepare(`
      SELECT id, home_id, type, payload_json, created_at
      FROM events
      WHERE home_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(home.id, limit).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      homeId: String((row as Record<string, unknown>).home_id),
      type: String((row as Record<string, unknown>).type),
      payload: parseJson<Record<string, unknown>>((row as Record<string, string>).payload_json, {}),
      createdAt: String((row as Record<string, unknown>).created_at),
    }));
  }

  listScenes(homeId?: string): SceneRecord[] {
    const home = this.resolveHome(homeId);
    return this.db.prepare(`
      SELECT id, home_id, label, description, actions_json
      FROM scenes
      WHERE home_id = ?
      ORDER BY label ASC
    `).all(home.id).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      homeId: String((row as Record<string, unknown>).home_id),
      label: String((row as Record<string, unknown>).label),
      description: ((row as Record<string, unknown>).description as string | null) ?? undefined,
      actions: parseJson<IoTActionRequest[]>((row as Record<string, string>).actions_json, []),
    }));
  }

  activateScene(homeId: string | undefined, sceneId: string, actor = "scene"): { scene: SceneRecord; results: IoTActionResult[] } {
    const home = this.resolveHome(homeId);
    const scene = this.listScenes(home.id).find((entry) => entry.id === sceneId);
    if (!scene) throw new Error(`Unknown scene ${sceneId}`);
    const results = scene.actions.map((action) => this.runAction(home.id, action, { actor }));
    this.logEvent(home.id, "iot.scene.activated", {
      sceneId: scene.id,
      label: scene.label,
      actor,
      resultCount: results.length,
    });
    return { scene, results };
  }

  listAutomations(homeId?: string): AutomationRecord[] {
    const home = this.resolveHome(homeId);
    return this.db.prepare(`
      SELECT id, home_id, label, enabled, trigger_json, conditions_json, actions_json
      FROM automations
      WHERE home_id = ?
      ORDER BY label ASC
    `).all(home.id).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      homeId: String((row as Record<string, unknown>).home_id),
      label: String((row as Record<string, unknown>).label),
      enabled: Boolean((row as Record<string, unknown>).enabled),
      trigger: parseJson<Record<string, unknown>>((row as Record<string, string>).trigger_json, {}),
      conditions: parseJson<Array<Record<string, unknown>>>((row as Record<string, string>).conditions_json, []),
      actions: parseJson<IoTActionRequest[]>((row as Record<string, string>).actions_json, []),
    }));
  }

  createAutomation(homeId: string | undefined, input: {
    id?: string;
    label: string;
    enabled?: boolean;
    trigger?: Record<string, unknown>;
    conditions?: Array<Record<string, unknown>>;
    actions: IoTActionRequest[];
  }): AutomationRecord {
    const home = this.resolveHome(homeId);
    const id = input.id?.trim() || `automation_${randomUUID().slice(0, 8)}`;
    this.db.prepare(`
      INSERT INTO automations (id, home_id, label, enabled, trigger_json, conditions_json, actions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      home.id,
      input.label,
      input.enabled === false ? 0 : 1,
      stringifyJson(input.trigger ?? { type: "manual" }),
      stringifyJson(input.conditions ?? []),
      stringifyJson(input.actions),
    );
    const automation = this.listAutomations(home.id).find((entry) => entry.id === id)!;
    this.logEvent(home.id, "iot.automation.created", {
      automationId: automation.id,
      label: automation.label,
    });
    return automation;
  }

  setAutomationEnabled(homeId: string | undefined, automationId: string, enabled: boolean): AutomationRecord {
    const home = this.resolveHome(homeId);
    const result = this.db.prepare(`
      UPDATE automations
      SET enabled = ?
      WHERE id = ? AND home_id = ?
    `).run(enabled ? 1 : 0, automationId, home.id);
    if (result.changes === 0) throw new Error(`Unknown automation ${automationId}`);
    const automation = this.listAutomations(home.id).find((entry) => entry.id === automationId)!;
    this.logEvent(home.id, enabled ? "iot.automation.enabled" : "iot.automation.disabled", {
      automationId,
      label: automation.label,
    });
    return automation;
  }

  runAutomation(homeId: string | undefined, automationId: string, actor = "automation"): { automation: AutomationRecord; results: IoTActionResult[] } {
    const home = this.resolveHome(homeId);
    const automation = this.listAutomations(home.id).find((entry) => entry.id === automationId);
    if (!automation) throw new Error(`Unknown automation ${automationId}`);
    const results = automation.actions.map((action) => this.runAction(home.id, action, { actor }));
    this.logEvent(home.id, "iot.automation.executed", {
      automationId: automation.id,
      label: automation.label,
      actor,
      resultCount: results.length,
    });
    return { automation, results };
  }

  listApprovals(homeId?: string): ApprovalRecord[] {
    const home = this.resolveHome(homeId);
    return this.db.prepare(`
      SELECT id, home_id, status, reason, action_json, created_at, updated_at
      FROM approvals
      WHERE home_id = ?
      ORDER BY created_at DESC
    `).all(home.id).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      homeId: String((row as Record<string, unknown>).home_id),
      status: String((row as Record<string, unknown>).status) as ApprovalRecord["status"],
      reason: String((row as Record<string, unknown>).reason),
      action: parseJson<IoTActionRequest>((row as Record<string, string>).action_json, { action: "set" }),
      createdAt: String((row as Record<string, unknown>).created_at),
      updatedAt: String((row as Record<string, unknown>).updated_at),
    }));
  }

  approveApproval(homeId: string | undefined, approvalId: string, actor = "operator") {
    const home = this.resolveHome(homeId);
    const approval = this.listApprovals(home.id).find((entry) => entry.id === approvalId);
    if (!approval) throw new Error(`Unknown approval ${approvalId}`);
    if (approval.status !== "pending") throw new Error(`Approval ${approvalId} is already ${approval.status}`);
    this.db.prepare(`
      UPDATE approvals
      SET status = 'approved', updated_at = ?
      WHERE id = ? AND home_id = ?
    `).run(nowIso(), approvalId, home.id);
    const result = this.runAction(home.id, approval.action, { actor, skipApproval: true });
    this.db.prepare(`
      UPDATE approvals
      SET status = 'executed', updated_at = ?
      WHERE id = ? AND home_id = ?
    `).run(nowIso(), approvalId, home.id);
    this.logEvent(home.id, "iot.approval.executed", {
      approvalId,
      actor,
      decision: result.decision,
    });
    return {
      approval: this.listApprovals(home.id).find((entry) => entry.id === approvalId)!,
      result,
    };
  }

  denyApproval(homeId: string | undefined, approvalId: string, actor = "operator") {
    const home = this.resolveHome(homeId);
    const result = this.db.prepare(`
      UPDATE approvals
      SET status = 'denied', updated_at = ?
      WHERE id = ? AND home_id = ?
    `).run(nowIso(), approvalId, home.id);
    if (result.changes === 0) throw new Error(`Unknown approval ${approvalId}`);
    this.logEvent(home.id, "iot.approval.denied", {
      approvalId,
      actor,
    });
    return this.listApprovals(home.id).find((entry) => entry.id === approvalId)!;
  }

  evaluatePolicy(homeId: string | undefined, request: IoTActionRequest): PolicyEvaluation {
    const home = this.resolveHome(homeId ?? request.homeId);
    const resolvedTargets = this.resolveTargets(home.id, request);
    if (resolvedTargets.candidates) {
      return {
        decision: "ambiguous",
        riskLevel: "safe",
        reasons: ["Selector matched multiple devices."],
        candidates: resolvedTargets.candidates,
      };
    }
    if (resolvedTargets.targets.length === 0) {
      return {
        decision: "deny",
        riskLevel: "safe",
        reasons: ["No devices matched the selector."],
      };
    }
    const riskLevel = resolvedTargets.targets.reduce<RiskLevel>((current, thing) => {
      if (thing.risk === "restricted") return "restricted";
      if (thing.risk === "caution" && current === "safe") return "caution";
      return current;
    }, "safe");
    const explicitTargeting = Boolean(request.selector?.trim() || request.targets?.length || request.area?.trim());
    if (riskLevel === "restricted" && (!explicitTargeting || resolvedTargets.targets.length > 1)) {
      return {
        decision: "deny",
        riskLevel,
        reasons: ["Restricted actions require one explicit target."],
      };
    }
    if (riskLevel === "restricted") {
      return {
        decision: "approval_required",
        riskLevel,
        reasons: ["Restricted device action requires approval."],
        resolvedTargetIds: resolvedTargets.targets.map((thing) => thing.id),
      };
    }
    return {
      decision: "allow",
      riskLevel,
      reasons: riskLevel === "caution" ? ["Proceeding with caution-level device."] : ["Action allowed by default policy."],
      resolvedTargetIds: resolvedTargets.targets.map((thing) => thing.id),
    };
  }

  runAction(homeId: string | undefined, request: IoTActionRequest, options: { actor?: string; skipApproval?: boolean } = {}): IoTActionResult {
    const home = this.resolveHome(homeId ?? request.homeId);
    const evaluation = this.evaluatePolicy(home.id, request);
    const updatedAt = nowIso();
    const resolvedTargets = this.resolveTargets(home.id, request);
    const targets = resolvedTargets.targets.map((thing) => ({
      id: thing.id,
      label: thing.label,
      kind: thing.kind,
      areaId: thing.areaId,
    }));
    if (evaluation.decision === "ambiguous") {
      return {
        status: "ambiguous",
        homeId: home.id,
        decision: evaluation.decision,
        reasons: evaluation.reasons,
        updatedAt,
        targets: [],
        capabilityUpdates: [],
        candidates: evaluation.candidates,
      };
    }
    if (evaluation.decision === "deny") {
      return {
        status: "denied",
        homeId: home.id,
        decision: evaluation.decision,
        reasons: evaluation.reasons,
        updatedAt,
        targets,
        capabilityUpdates: [],
      };
    }
    if (evaluation.decision === "approval_required" && !options.skipApproval) {
      const approvalId = `approval_${randomUUID().slice(0, 8)}`;
      this.db.prepare(`
        INSERT INTO approvals (id, home_id, status, reason, action_json, created_at, updated_at)
        VALUES (?, ?, 'pending', ?, ?, ?, ?)
      `).run(
        approvalId,
        home.id,
        evaluation.reasons.join(" "),
        stringifyJson(request),
        updatedAt,
        updatedAt,
      );
      this.logEvent(home.id, "iot.approval.created", {
        approvalId,
        request,
        actor: options.actor ?? "system",
      });
      return {
        status: "approval_required",
        homeId: home.id,
        decision: evaluation.decision,
        reasons: evaluation.reasons,
        updatedAt,
        targets,
        capabilityUpdates: [],
        approvalId,
      };
    }

    const capabilityKey = this.resolveCapabilityKey(request, resolvedTargets.targets);
    const capabilityUpdates = resolvedTargets.targets.map((thing) => {
      const capability = thing.capabilities.find((entry) => entry.key === capabilityKey);
      if (!capability) {
        throw new Error(`Capability ${capabilityKey} is not available on ${thing.label}`);
      }
      const nextValue = this.resolveNextValue(request, capability.observedValue);
      this.db.prepare(`
        UPDATE capabilities
        SET observed_value_json = ?, desired_value_json = ?, observed_at = ?
        WHERE id = ?
      `).run(stringifyJson(nextValue), stringifyJson(nextValue), updatedAt, capability.id);
      return {
        thingId: thing.id,
        capability: capability.key,
        observedValue: nextValue,
        desiredValue: nextValue,
      };
    });

    const requestId = `cmd_${randomUUID().slice(0, 8)}`;
    this.db.prepare(`
      INSERT INTO command_log (id, home_id, request_json, result_json, status, created_at)
      VALUES (?, ?, ?, ?, 'executed', ?)
    `).run(
      requestId,
      home.id,
      stringifyJson(request),
      stringifyJson({ capabilityUpdates, targets }),
      updatedAt,
    );
    this.logEvent(home.id, "iot.action.executed", {
      requestId,
      request,
      targets,
      capabilityUpdates,
      actor: options.actor ?? "system",
    });
    this.onActionExecuted?.({
      home,
      request,
      capabilityKey,
      targets: resolvedTargets.targets,
      capabilityUpdates,
      actor: options.actor ?? "system",
    });
    return {
      status: "executed",
      homeId: home.id,
      decision: "allow",
      reasons: evaluation.reasons,
      updatedAt,
      targets,
      capabilityUpdates,
    };
  }

  /** Insert a new thing record plus its initial capabilities. Returns
   *  the persisted ThingRecord so callers can immediately publish it
   *  on the realtime stream. */
  createThing(homeId: string | undefined, input: CreateThingInput): ThingRecord {
    const home = this.resolveHome(homeId);
    const id = `thing_${randomUUID().slice(0, 8)}`;
    const createdAt = nowIso();
    this.db.prepare(`
      INSERT INTO things (id, home_id, area_id, label, aliases_json, kind, risk, connector_id, target_ref, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      home.id,
      input.areaId ?? null,
      input.label,
      stringifyJson(input.aliases ?? []),
      input.kind,
      (input.risk ?? "safe") satisfies RiskLevel,
      input.connectorId,
      input.targetRef,
      input.metadata ? stringifyJson(input.metadata) : null,
    );
    for (const capability of input.capabilities ?? []) {
      this.db.prepare(`
        INSERT INTO capabilities (id, thing_id, key, label, value_type, unit, observed_value_json, desired_value_json, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `cap_${randomUUID().slice(0, 8)}`,
        id,
        capability.key,
        capability.label ?? capability.key,
        capability.valueType ?? "string",
        capability.unit ?? null,
        capability.observedValue !== undefined ? stringifyJson(capability.observedValue) : null,
        capability.desiredValue !== undefined ? stringifyJson(capability.desiredValue) : null,
        createdAt,
      );
    }
    this.logEvent(home.id, "iot.thing.added", { id, label: input.label, kind: input.kind, connectorId: input.connectorId });
    const thing = this.listThings(home.id).find((entry) => entry.id === id);
    if (!thing) {
      throw new Error(`Created thing ${id} not found after insert.`);
    }
    return thing;
  }

  /** Move a thing to the deleted state. Phase 2 hard-deletes; the
   *  Phase 3 UI will introduce the trash window required by red line 4. */
  deleteThing(homeId: string | undefined, thingId: string): { id: string; label: string } {
    const home = this.resolveHome(homeId);
    const things = this.listThings(home.id);
    const thing = things.find((entry) => entry.id === thingId);
    if (!thing) {
      throw new Error(`Unknown thing ${thingId}`);
    }
    this.db.prepare(`DELETE FROM capabilities WHERE thing_id = ?`).run(thingId);
    this.db.prepare(`DELETE FROM things WHERE id = ? AND home_id = ?`).run(thingId, home.id);
    this.logEvent(home.id, "iot.thing.removed", { id: thingId, label: thing.label });
    return { id: thing.id, label: thing.label };
  }

  rawInvoke(input: {
    connector: string;
    homeId?: string;
    target: string;
    action: string;
    payload?: Record<string, unknown>;
  }) {
    const home = this.resolveHome(input.homeId);
    const response = {
      connector: input.connector,
      homeId: home.id,
      target: input.target,
      action: input.action,
      payload: input.payload ?? {},
      acceptedAt: nowIso(),
    };
    this.logEvent(home.id, "iot.raw.invoked", response);
    return response;
  }

  private resolveTargets(homeId: string, request: IoTActionRequest): {
    targets: ThingRecord[];
    candidates?: Array<{ id: string; label: string; kind: ThingKind }>;
  } {
    const things = this.listThings(homeId, {
      ...(request.family ? { kind: request.family } : {}),
      ...(request.area ? { area: request.area } : {}),
    });
    if (request.targets?.length) {
      return {
        targets: things.filter((thing) => request.targets?.includes(thing.id) || request.targets?.includes(thing.label)),
      };
    }
    if (request.selector?.trim()) {
      const matches = things.filter((thing) => matchesText(request.selector ?? "", [thing.id, thing.label, ...thing.aliases, thing.targetRef]));
      if (matches.length > 1) {
        return {
          targets: [],
          candidates: matches.map((thing) => ({ id: thing.id, label: thing.label, kind: thing.kind })),
        };
      }
      return { targets: matches };
    }
    if (request.family === "light" && request.action === "off") {
      return { targets: things };
    }
    return { targets: things };
  }

  private resolveCapabilityKey(request: IoTActionRequest, targets: ThingRecord[]): string {
    if (request.capability?.trim()) return request.capability.trim();
    const family = request.family ?? targets[0]?.kind;
    if (family === "climate" && request.action === "set") return "targetTemperature";
    if (family === "lock") return "lockState";
    if (family === "cover") return "position";
    return "power";
  }

  private resolveNextValue(request: IoTActionRequest, currentValue: unknown): unknown {
    switch (request.action) {
      case "on":
        return true;
      case "off":
        return false;
      case "toggle":
        return !Boolean(currentValue);
      case "lock":
        return "locked";
      case "unlock":
        return "unlocked";
      case "open":
        return "open";
      case "close":
        return "closed";
      case "activate":
        return "active";
      case "set":
        return request.value;
      default:
        return request.value ?? request.action;
    }
  }

  private listCapabilitiesForThing(thingId: string): CapabilityRecord[] {
    return this.db.prepare(`
      SELECT id, thing_id, key, label, writable, readable, unit, observed_value_json, desired_value_json, observed_at
      FROM capabilities
      WHERE thing_id = ?
      ORDER BY key ASC
    `).all(thingId).map((row) => ({
      id: String((row as Record<string, unknown>).id),
      thingId: String((row as Record<string, unknown>).thing_id),
      key: String((row as Record<string, unknown>).key),
      label: String((row as Record<string, unknown>).label),
      writable: Boolean((row as Record<string, unknown>).writable),
      readable: Boolean((row as Record<string, unknown>).readable),
      unit: ((row as Record<string, unknown>).unit as string | null) ?? undefined,
      observedValue: parseJson((row as Record<string, string>).observed_value_json, null),
      desiredValue: parseJson((row as Record<string, string>).desired_value_json, null),
      observedAt: String((row as Record<string, unknown>).observed_at),
    }));
  }

  private logEvent(homeId: string, type: string, payload: Record<string, unknown>): IotEventEnvelope {
    const event: IotEventEnvelope = {
      id: `evt_${randomUUID().slice(0, 8)}`,
      homeId,
      type,
      payload,
      createdAt: nowIso(),
    };
    this.db.prepare(`
      INSERT INTO events (id, home_id, type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(event.id, event.homeId, event.type, stringifyJson(event.payload), event.createdAt);
    this.onEvent?.(event);
    return event;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS homes (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS areas (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        label TEXT NOT NULL,
        aliases_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS connectors (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        label TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        capabilities_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS things (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        area_id TEXT,
        label TEXT NOT NULL,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        kind TEXT NOT NULL,
        risk TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        target_ref TEXT NOT NULL,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS capabilities (
        id TEXT PRIMARY KEY,
        thing_id TEXT NOT NULL,
        key TEXT NOT NULL,
        label TEXT NOT NULL,
        writable INTEGER NOT NULL DEFAULT 1,
        readable INTEGER NOT NULL DEFAULT 1,
        unit TEXT,
        observed_value_json TEXT NOT NULL DEFAULT 'null',
        desired_value_json TEXT NOT NULL DEFAULT 'null',
        observed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        actions_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        label TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        trigger_json TEXT NOT NULL DEFAULT '{}',
        conditions_json TEXT NOT NULL DEFAULT '[]',
        actions_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        action_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS command_log (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        request_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  private seed(): void {
    const existing = this.db.prepare("SELECT COUNT(*) as count FROM homes").get() as { count: number };
    if (existing.count > 0) return;
    const createdAt = nowIso();
    this.db.prepare(`
      INSERT INTO homes (id, label, is_default, created_at)
      VALUES ('home_main', 'Primary Home', 1, ?)
    `).run(createdAt);
    const areas = [
      { id: "office", label: "Office", aliases: ["oficina"] },
      { id: "living-room", label: "Living Room", aliases: ["salon", "salón"] },
      { id: "bedroom", label: "Bedroom", aliases: ["dormitorio"] },
      { id: "entry", label: "Entry", aliases: ["entrada"] },
    ];
    const insertArea = this.db.prepare(`
      INSERT INTO areas (id, home_id, label, aliases_json)
      VALUES (?, 'home_main', ?, ?)
    `);
    for (const area of areas) {
      insertArea.run(area.id, area.label, stringifyJson(area.aliases));
    }
    const insertConnector = this.db.prepare(`
      INSERT INTO connectors (id, home_id, label, kind, status, capabilities_json)
      VALUES (?, 'home_main', ?, ?, ?, ?)
    `);
    insertConnector.run("home-assistant", "Home Assistant", "bridge", "ready", stringifyJson(["sync", "raw", "scenes"]));
    insertConnector.run("homekit", "HomeKit", "bridge", "ready", stringifyJson(["sync", "scenes"]));
    insertConnector.run("mqtt", "MQTT", "protocol", "ready", stringifyJson(["publish", "subscribe", "raw"]));
    insertConnector.run("ifttt", "IFTTT", "bridge", "degraded", stringifyJson(["webhook"]));

    const insertThing = this.db.prepare(`
      INSERT INTO things (id, home_id, area_id, label, aliases_json, kind, risk, connector_id, target_ref, metadata_json)
      VALUES (?, 'home_main', ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCapability = this.db.prepare(`
      INSERT INTO capabilities (id, thing_id, key, label, writable, readable, unit, observed_value_json, desired_value_json, observed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const thingDefs = [
      {
        id: "office-light",
        areaId: "office",
        label: "Office Light",
        aliases: ["office lights", "oficina"],
        kind: "light",
        risk: "safe",
        connectorId: "home-assistant",
        targetRef: "light.office_main",
        metadata: { brightness: true },
        capabilities: [
          { key: "power", label: "Power", observedValue: true },
          { key: "brightness", label: "Brightness", observedValue: 72, unit: "%" },
        ],
      },
      {
        id: "living-room-light",
        areaId: "living-room",
        label: "Living Room Lamp",
        aliases: ["salon lights", "living room"],
        kind: "light",
        risk: "safe",
        connectorId: "homekit",
        targetRef: "light.living_room_lamp",
        metadata: { brightness: true },
        capabilities: [
          { key: "power", label: "Power", observedValue: true },
          { key: "brightness", label: "Brightness", observedValue: 48, unit: "%" },
        ],
      },
      {
        id: "main-thermostat",
        areaId: "living-room",
        label: "Main Thermostat",
        aliases: ["thermostat", "climate"],
        kind: "climate",
        risk: "caution",
        connectorId: "home-assistant",
        targetRef: "climate.main_floor",
        metadata: { mode: "heat" },
        capabilities: [
          { key: "power", label: "Enabled", observedValue: true },
          { key: "targetTemperature", label: "Target Temperature", observedValue: 21, unit: "C" },
        ],
      },
      {
        id: "front-door-lock",
        areaId: "entry",
        label: "Front Door Lock",
        aliases: ["front door", "lock"],
        kind: "lock",
        risk: "restricted",
        connectorId: "home-assistant",
        targetRef: "lock.front_door",
        metadata: { vendor: "Yale" },
        capabilities: [
          { key: "lockState", label: "Lock State", observedValue: "locked" },
        ],
      },
    ] as const;

    for (const thing of thingDefs) {
      insertThing.run(
        thing.id,
        thing.areaId,
        thing.label,
        stringifyJson(thing.aliases),
        thing.kind,
        thing.risk,
        thing.connectorId,
        thing.targetRef,
        stringifyJson(thing.metadata),
      );
      for (const capability of thing.capabilities) {
        insertCapability.run(
          `${thing.id}:${capability.key}`,
          thing.id,
          capability.key,
          capability.label,
          1,
          1,
          capability.unit ?? null,
          stringifyJson(capability.observedValue),
          stringifyJson(capability.observedValue),
          createdAt,
        );
      }
    }

    this.db.prepare(`
      INSERT INTO scenes (id, home_id, label, description, actions_json)
      VALUES
        ('scene_good_night', 'home_main', 'Good Night', 'Turns off lights and lowers the thermostat.', ?),
        ('scene_focus', 'home_main', 'Focus', 'Keeps the office ready for work.', ?)
    `).run(
      stringifyJson([
        { family: "light", action: "off" },
        { family: "climate", selector: "thermostat", action: "set", value: 19 },
      ] satisfies IoTActionRequest[]),
      stringifyJson([
        { family: "light", selector: "office", action: "on" },
        { family: "climate", selector: "thermostat", action: "set", value: 21 },
      ] satisfies IoTActionRequest[]),
    );

    this.db.prepare(`
      INSERT INTO automations (id, home_id, label, enabled, trigger_json, conditions_json, actions_json)
      VALUES
        ('automation_bedtime', 'home_main', 'Bedtime', 1, ?, ?, ?)
    `).run(
      stringifyJson({ type: "schedule", at: "23:00" }),
      stringifyJson([{ type: "presence", equals: "home" }]),
      stringifyJson([{ family: "light", action: "off" }] satisfies IoTActionRequest[]),
    );

    this.logEvent("home_main", "iot.seeded", {
      homes: 1,
      areas: areas.length,
      things: thingDefs.length,
    });
  }
}
