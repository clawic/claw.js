// Connector adapter SPI.
//
// Each adapter is a runtime plugin that knows how to talk to a class of
// devices: HTTP REST endpoints, the local Philips Hue bridge, MQTT
// topics, Matter commissioning, cloud bridges, etc. The IoT service
// hosts a registry of adapters and routes every action through the
// adapter whose id matches `ThingRecord.connectorId`.
//
// The interface is intentionally small. Adapters that publish state
// proactively implement `subscribe`; adapters that can be polled
// implement `pollState`; adapters that discover new hardware implement
// `discover`. Mock adapters can implement none of the optional hooks.

import type { ThingRecord } from "../db.ts";

/** Severity grade attached to discovered devices and dispatch operations.
 *  Mirrors the daemon's local RiskLevel; the tools registry maps it onto
 *  AgentToolRiskLevel before reaching the agent. */
type AdapterRiskLevel = "safe" | "caution" | "restricted";

/** A capability the device announces it can answer for, e.g. "power",
 *  "brightness", "color". Mirrors the SQLite capabilities schema. */
interface AdapterCapability {
  key: string;
  label?: string;
  valueType?: "bool" | "number" | "string" | "color" | "enum";
  unit?: string;
  enumValues?: string[];
  min?: number;
  max?: number;
}

/** A device an adapter found during discovery, not yet added to the
 *  store. Adding it is an explicit user action that turns it into a
 *  ThingRecord. */
export interface DiscoveredDevice {
  /** Stable handle across discovery runs (MAC, UUID, etc.). */
  fingerprint: string;
  /** Adapter that surfaced this device. */
  connectorId: string;
  /** Suggested human label. */
  label: string;
  /** Suggested IoTThingKind. */
  kind: ThingRecord["kind"];
  /** Connector-specific addressing string (IP, topic, vendor id). */
  targetRef: string;
  /** Optional risk hint for the future thing record. */
  risk?: AdapterRiskLevel;
  /** Optional metadata blob the adapter may want to round-trip. */
  metadata?: Record<string, unknown>;
  /** Capabilities the device announces, when known at discovery time. */
  capabilities?: AdapterCapability[];
  /** ISO timestamp the device was first seen during the current run. */
  discoveredAt: string;
}

/** Dispatch context handed to adapters. The store keeps full target
 *  resolution; adapters receive the resolved thing record plus the
 *  desired value for one capability. */
export interface DispatchContext {
  thing: ThingRecord;
  capability: string;
  desiredValue: unknown;
  /** Original action verb (`on`, `off`, `set`, ...) in case the adapter
   *  branches on intent. */
  action: string;
  /** Signal that aborts the dispatch when the daemon is shutting down
   *  or the user cancels mid-flight. Adapters should respect it on
   *  long-running network calls. */
  signal?: AbortSignal;
}

/** Adapter dispatch outcome. `observedValue` is the value the device
 *  reported BACK; the store updates SQLite with this rather than the
 *  desired value, so the UI reflects what actually happened. */
export interface DispatchResult {
  observedValue: unknown;
  /** Free-form note the adapter can attach (e.g. "device offline,
   *  using cached state"). Surfaced in the activity feed. */
  note?: string;
}

/** Discovery options the orchestrator passes to adapters. */
export interface DiscoveryOptions {
  /** Stop scanning when fired. */
  signal?: AbortSignal;
  /** Max time the adapter should spend per pass; default 8s. */
  timeoutMs?: number;
  /** Filter by kind. Adapters that cannot enumerate the requested kind
   *  return without yielding. */
  kind?: ThingRecord["kind"];
}

/** The plugin contract. Mandatory: id, label, dispatch. Optional:
 *  discover, subscribe, pollState, attach, detach. */
export interface ConnectorAdapter {
  readonly id: string;
  readonly label: string;
  readonly description?: string;

  /** Send a desired-value to a device and return what the device
   *  reports. Phase 2 dispatches are best-effort: if the call fails
   *  the store keeps the optimistic update and logs the error. */
  dispatch(context: DispatchContext): Promise<DispatchResult>;

  /** Yield devices the adapter sees on the network/cloud. The
   *  orchestrator drives the iterator and broadcasts each device. */
  discover?(options: DiscoveryOptions): AsyncIterable<DiscoveredDevice>;

  /** Read current state for one thing, e.g. to refresh after a
   *  network outage. */
  pollState?(thing: ThingRecord): Promise<Record<string, unknown>>;

  /** Subscribe to push events from the device. Returns an unsubscribe
   *  function. Adapters without push support omit this hook. */
  subscribe?(
    thing: ThingRecord,
    onUpdate: (capability: string, observedValue: unknown) => void,
  ): () => void;

  /** Lifecycle hook called when a thing is added to the store. */
  attach?(thing: ThingRecord): Promise<void>;

  /** Lifecycle hook called when a thing is removed. */
  detach?(thing: ThingRecord): Promise<void>;
}
