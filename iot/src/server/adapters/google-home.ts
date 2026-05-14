import { clawApiPath } from "@clawjs/core";
// Google Home (Smart Home Actions) adapter.
//
// Bidirectional bridge that lets Google Home / Assistant see Clawix
// things as Google devices:
//   - INBOUND: Google sends OAuth-authenticated POSTs to our
//     fulfillment endpoint (clawApiPath(`cloud/google/fulfillment`)) when the
//     user says "Hey Google, turn on the bedroom light". The adapter
//     translates SYNC / QUERY / EXECUTE / DISCONNECT intents into
//     `IotServiceStore` reads + writes.
//   - OUTBOUND: when a thing's state changes locally (UI toggle,
//     automation, agent action), the adapter calls `ReportState` on
//     Google's HomeGraph API so the Google Home app reflects it.
//
// Constitution caveats:
//   - This requires the user to create a Smart Home Action in the
//     Google Actions Console and point its fulfillment URL at a
//     public endpoint that proxies to the daemon. Constitution X.4
//     foresees this via the mesh's NAT traversal; until that ships,
//     the user provides their own tunnel (Cloudflare Tunnel, ngrok,
//     self-hosted relay) and pastes its URL into the wizard.
//   - Tokens (OAuth client secret + HomeGraph service account JSON)
//     belong in SecretsVault for production. V1 keeps them in
//     memory and the wizard documents the trade-off.

import type {
  ConnectorAdapter,
  DiscoveredDevice,
  DiscoveryOptions,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

export const GOOGLE_HOME_ID = "google-home";

interface GoogleHomeThingConfig {
  /** Stable device id exposed to Google. Defaults to the thing id. */
  googleDeviceId: string;
  /** Google device type, e.g. action.devices.types.LIGHT. */
  type: string;
  /** Google traits this device supports, e.g.
   *  ["action.devices.traits.OnOff", "action.devices.traits.Brightness"]. */
  traits: string[];
}

export interface GoogleHomeCredentials {
  /** Public URL that fronts the daemon's fulfillment endpoint. */
  publicFulfillmentUrl: string;
  /** OAuth client id Google sends in Authorization headers. */
  oauthClientId: string;
  /** Bearer token the daemon expects to find on every fulfillment
   *  request. The user mints this from the Actions console. */
  oauthClientSecret: string;
  /** HomeGraph service-account access token, refreshed by the wizard
   *  on demand. Used for ReportState pushes. */
  homeGraphToken?: string;
  /** Agent user id Google associates the linked account with. */
  agentUserId: string;
}

interface GoogleHomeSession {
  credentials: GoogleHomeCredentials;
  exportedThings: Map<string, GoogleHomeThingConfig>;
}

export interface GoogleHomeAdapterContext {
  resolveThings: () => Array<{
    id: string;
    label: string;
    kind: string;
    metadata?: Record<string, unknown>;
  }>;
  runAction: (input: { thingId: string; capability: string; desired: unknown; action: string }) => unknown;
  readThingState: (thingId: string) => Record<string, unknown>;
}

function readThingConfig(metadata: Record<string, unknown> | undefined): GoogleHomeThingConfig | null {
  const raw = metadata?.googleHome;
  if (!raw || typeof raw !== "object") return null;
  const config = raw as Partial<GoogleHomeThingConfig>;
  if (typeof config.googleDeviceId !== "string" || typeof config.type !== "string") return null;
  if (!Array.isArray(config.traits)) return null;
  return config as GoogleHomeThingConfig;
}

export class GoogleHomeAdapter implements ConnectorAdapter {
  readonly id = GOOGLE_HOME_ID;
  readonly label = "Google Home";
  readonly description =
    "Smart Home Actions bridge so Google Assistant / Google Home can see and control Clawix things.";

  private session: GoogleHomeSession | null = null;
  private context: GoogleHomeAdapterContext | null = null;

  /** Wired by app.ts at registration time so the fulfillment handler
   *  can reach the store without us holding a direct reference. */
  bindContext(context: GoogleHomeAdapterContext): void {
    this.context = context;
  }

  /** Wizard entry. The user pastes the OAuth credentials + public
   *  fulfillment URL minted in the Actions console. The adapter
   *  caches them in memory; subsequent fulfillment POSTs authenticate
   *  against this session. */
  async connect(credentials: GoogleHomeCredentials): Promise<{ connected: boolean; reason?: string }> {
    if (!credentials.oauthClientId || !credentials.oauthClientSecret) {
      return { connected: false, reason: "OAuth client id and secret are required." };
    }
    this.session = {
      credentials,
      exportedThings: new Map(),
    };
    return { connected: true };
  }

  disconnect(): void {
    this.session = null;
  }

  /** Returns true when the bearer matches the OAuth client secret the
   *  user pasted. Called by the Fastify route handler in
   *  `cloud-fulfillment.ts` before processing the request body. */
  authenticate(bearer: string | null): boolean {
    if (!this.session || !bearer) return false;
    return bearer === this.session.credentials.oauthClientSecret;
  }

  /** Fulfillment dispatcher. Translates a Google intent payload into
   *  one or more IoT store mutations and returns the Google-shaped
   *  response payload. */
  handleFulfillment(body: { requestId: string; inputs: Array<{ intent: string; payload?: Record<string, unknown> }> }): unknown {
    if (!this.session || !this.context) {
      return { requestId: body.requestId, payload: { errorCode: "authFailure" } };
    }
    const input = body.inputs[0];
    if (!input) {
      return { requestId: body.requestId, payload: { errorCode: "protocolError" } };
    }
    switch (input.intent) {
      case "action.devices.SYNC":
        return this.handleSync(body.requestId);
      case "action.devices.QUERY":
        return this.handleQuery(body.requestId, (input.payload?.devices as Array<{ id: string }>) ?? []);
      case "action.devices.EXECUTE":
        return this.handleExecute(body.requestId, input.payload);
      case "action.devices.DISCONNECT":
        this.disconnect();
        return {};
      default:
        return { requestId: body.requestId, payload: { errorCode: "notSupported" } };
    }
  }

  private handleSync(requestId: string): unknown {
    if (!this.session || !this.context) return {};
    const things = this.context.resolveThings();
    const devices = things
      .map((thing) => {
        const config = readThingConfig(thing.metadata);
        if (!config) return null;
        return {
          id: config.googleDeviceId,
          type: config.type,
          traits: config.traits,
          name: { name: thing.label },
          willReportState: true,
        };
      })
      .filter((entry): entry is Exclude<typeof entry, null> => entry !== null);
    return {
      requestId,
      payload: {
        agentUserId: this.session.credentials.agentUserId,
        devices,
      },
    };
  }

  private handleQuery(requestId: string, devices: Array<{ id: string }>): unknown {
    if (!this.context) return {};
    const state: Record<string, Record<string, unknown>> = {};
    for (const device of devices) {
      const thing = this.context
        .resolveThings()
        .find((entry) => readThingConfig(entry.metadata)?.googleDeviceId === device.id);
      if (!thing) {
        state[device.id] = { online: false, status: "ERROR", errorCode: "deviceNotFound" };
        continue;
      }
      state[device.id] = {
        online: true,
        status: "SUCCESS",
        ...this.context.readThingState(thing.id),
      };
    }
    return { requestId, payload: { devices: state } };
  }

  private handleExecute(requestId: string, payload: Record<string, unknown> | undefined): unknown {
    if (!this.context) return {};
    const commands = (payload?.commands as Array<{
      devices: Array<{ id: string }>;
      execution: Array<{ command: string; params?: Record<string, unknown> }>;
    }>) ?? [];
    const results: Array<{ ids: string[]; status: string; states?: Record<string, unknown> }> = [];
    for (const command of commands) {
      for (const device of command.devices) {
        const thing = this.context
          .resolveThings()
          .find((entry) => readThingConfig(entry.metadata)?.googleDeviceId === device.id);
        if (!thing) {
          results.push({ ids: [device.id], status: "ERROR" });
          continue;
        }
        for (const execution of command.execution) {
          const mapped = mapGoogleCommandToAction(execution);
          if (!mapped) continue;
          try {
            this.context.runAction({
              thingId: thing.id,
              capability: mapped.capability,
              desired: mapped.value,
              action: mapped.action,
            });
            results.push({
              ids: [device.id],
              status: "SUCCESS",
              states: { online: true, ...mapped.state },
            });
          } catch (error) {
            results.push({
              ids: [device.id],
              status: "ERROR",
              states: { errorCode: error instanceof Error ? error.message : "endpointUnreachable" },
            });
          }
        }
      }
    }
    return { requestId, payload: { commands: results } };
  }

  async dispatch(_context: DispatchContext): Promise<DispatchResult> {
    if (!this.session) {
      throw new Error("google-home: not connected. Run iot.googleHome.connect first.");
    }
    // No outbound work on dispatch — the change ran locally; the
    // adapter reports state asynchronously via ReportState on the
    // next tick.
    return { observedValue: _context.desiredValue };
  }

  /** ReportState push to HomeGraph. Called by the wizard or an
   *  automation; we expose it through the `iot.googleHome.reportState`
   *  tool so the wizard can prove the bridge end-to-end. */
  async reportState(input: { deviceId: string; state: Record<string, unknown> }): Promise<{ pushed: boolean; reason?: string }> {
    if (!this.session) return { pushed: false, reason: "Not connected." };
    if (!this.session.credentials.homeGraphToken) {
      return { pushed: false, reason: "Missing HomeGraph token. Refresh from the Google Cloud console." };
    }
    try {
      const response = await fetch("https://homegraph.googleapis.com/v1/devices:reportStateAndNotification", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.session.credentials.homeGraphToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: `clawix-${Date.now()}`,
          agentUserId: this.session.credentials.agentUserId,
          payload: {
            devices: { states: { [input.deviceId]: input.state } },
          },
        }),
      });
      return { pushed: response.ok };
    } catch (error) {
      return { pushed: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async *discover(_options: DiscoveryOptions): AsyncIterable<DiscoveredDevice> {
    return;
  }
}

function mapGoogleCommandToAction(execution: { command: string; params?: Record<string, unknown> }):
  | { capability: string; value: unknown; action: string; state: Record<string, unknown> }
  | null {
  switch (execution.command) {
    case "action.devices.commands.OnOff": {
      const on = Boolean(execution.params?.on);
      return { capability: "power", value: on, action: on ? "on" : "off", state: { on } };
    }
    case "action.devices.commands.BrightnessAbsolute": {
      const brightness = Number(execution.params?.brightness ?? 0);
      return { capability: "brightness", value: brightness, action: "set", state: { brightness } };
    }
    case "action.devices.commands.ColorAbsolute": {
      const color = execution.params?.color as Record<string, unknown> | undefined;
      return { capability: "color", value: color ?? null, action: "set", state: { color } };
    }
    case "action.devices.commands.LockUnlock": {
      const lock = Boolean(execution.params?.lock);
      return {
        capability: "lock_state",
        value: lock ? "locked" : "unlocked",
        action: lock ? "lock" : "unlock",
        state: { isLocked: lock },
      };
    }
    default:
      return null;
  }
}
