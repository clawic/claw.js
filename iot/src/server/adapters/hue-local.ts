// Philips Hue bridge — local API adapter.
//
// Talks to the bridge over its loopback-friendly REST surface (no cloud
// round-trip). Configuration on the thing record:
//
//   metadata.hue = {
//     "bridgeIp": "192.168.1.50",
//     "username": "<application-key>",
//     "resource": "light" | "grouped_light" | "scene",
//     "resourceId": "<v2 uuid>"
//   }
//
// The first-time pairing flow (link-button press + key generation) lives
// in the discovery orchestrator: it surfaces the bridge as a discovered
// device and the Phase 3 wizard guides the user through pairing.
//
// Capability mapping (Hue v2 -> our capability keys):
//   power      -> on/off  -> { "on": { "on": <bool> } }
//   brightness -> 0..100  -> { "dimming": { "brightness": <0..100> } }
//   color_temp -> mireds  -> { "color_temperature": { "mirek": <num> } }
//   color      -> {x,y}   -> { "color": { "xy": { "x": <num>, "y": <num> } } }

import type {
  ConnectorAdapter,
  DiscoveredDevice,
  DiscoveryOptions,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

const HUE_LOCAL_ID = "hue-local";

interface HueConfig {
  bridgeIp: string;
  username: string;
  resource: "light" | "grouped_light" | "scene";
  resourceId: string;
}

function readConfig(metadata: Record<string, unknown> | undefined): HueConfig | null {
  const raw = metadata?.hue;
  if (!raw || typeof raw !== "object") return null;
  const config = raw as Partial<HueConfig>;
  if (!config.bridgeIp || !config.username || !config.resource || !config.resourceId) {
    return null;
  }
  return config as HueConfig;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function buildPayload(capability: string, desired: unknown): Record<string, unknown> | null {
  switch (capability) {
    case "power": {
      return { on: { on: Boolean(desired) } };
    }
    case "brightness": {
      const numeric = typeof desired === "number" ? desired : Number(desired);
      return { dimming: { brightness: clamp(numeric, 0, 100) } };
    }
    case "color_temp": {
      const numeric = typeof desired === "number" ? desired : Number(desired);
      return { color_temperature: { mirek: clamp(numeric, 153, 500) } };
    }
    case "color": {
      if (typeof desired === "object" && desired) {
        const xy = desired as { x?: number; y?: number };
        if (typeof xy.x === "number" && typeof xy.y === "number") {
          return { color: { xy: { x: clamp(xy.x, 0, 1), y: clamp(xy.y, 0, 1) } } };
        }
      }
      return null;
    }
    default:
      return null;
  }
}

export class HueLocalAdapter implements ConnectorAdapter {
  readonly id = HUE_LOCAL_ID;
  readonly label = "Philips Hue (local)";
  readonly description =
    "Controls Hue lights and groups through the bridge's local HTTPS API. No cloud round-trip.";

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const config = readConfig(context.thing.metadata);
    if (!config) {
      throw new Error(
        `hue-local: thing ${context.thing.id} is missing metadata.hue configuration`,
      );
    }
    const payload = buildPayload(context.capability, context.desiredValue);
    if (!payload) {
      throw new Error(
        `hue-local: capability ${context.capability} is not mapped for Hue resources`,
      );
    }

    const url = new URL(
      `/clip/v2/resource/${config.resource}/${config.resourceId}`,
      `https://${config.bridgeIp}`,
    );
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "hue-application-key": config.username,
      },
      body: JSON.stringify(payload),
      signal: context.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`hue-local: PUT ${url.pathname} returned ${response.status} ${body}`);
    }
    return { observedValue: context.desiredValue };
  }

  /** Discovery yields the local Hue bridge if mDNS spotted one. The
   *  orchestrator detects `_hue._tcp` advertisements; here we just
   *  surface what the orchestrator collected. The thing record is the
   *  bridge itself; the Phase 3 wizard then pulls down the bridge's
   *  light list once paired. */
  async *discover(_options: DiscoveryOptions): AsyncIterable<DiscoveredDevice> {
    // No-op without the orchestrator feeding us; real implementation
    // wires this hook through `DiscoveryOrchestrator.scan(adapter)`
    // when adapters want to do protocol-specific probing on demand.
    return;
  }
}
