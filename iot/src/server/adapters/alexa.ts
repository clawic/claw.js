// Alexa Smart Home adapter.
//
// Mirrors GoogleHomeAdapter for Amazon Alexa Smart Home Skills.
//   - INBOUND: Alexa POSTs directives (`Alexa.Discovery`,
//     `Alexa.PowerController`, `Alexa.BrightnessController`, ...) to
//     our fulfillment endpoint. The adapter translates them into
//     `IotServiceStore` reads + writes and returns the Alexa-shaped
//     event payload.
//   - OUTBOUND: when a thing's state changes locally, the adapter
//     calls `Alexa.ChangeReport` against the Alexa Event Gateway so
//     the user's voice device + Alexa app stay in sync.
//
// Constitution caveats identical to Google Home: requires user-owned
// developer credentials + a public fulfillment URL until the mesh
// NAT-traversal layer ships.

import type {
  ConnectorAdapter,
  DiscoveredDevice,
  DiscoveryOptions,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

export const ALEXA_ID = "alexa";

interface AlexaDeviceConfig {
  endpointId: string;
  /** Alexa capability interfaces, e.g. ["Alexa.PowerController",
   *  "Alexa.BrightnessController", "Alexa.EndpointHealth"]. */
  capabilities: string[];
  /** Display category, e.g. "LIGHT", "SWITCH", "THERMOSTAT". */
  displayCategory: string;
}

export interface AlexaCredentials {
  publicFulfillmentUrl: string;
  /** OAuth access token Alexa sends in the bearer header. */
  oauthClientSecret: string;
  /** Amazon Skill Messaging API token used for ChangeReport pushes. */
  eventGatewayToken?: string;
  /** Event Gateway endpoint per region (NA / EU / FE). */
  eventGatewayUrl?: string;
}

interface AlexaSession {
  credentials: AlexaCredentials;
}

export interface AlexaAdapterContext {
  resolveThings: () => Array<{
    id: string;
    label: string;
    kind: string;
    metadata?: Record<string, unknown>;
  }>;
  runAction: (input: { thingId: string; capability: string; desired: unknown; action: string }) => unknown;
  readThingState: (thingId: string) => Record<string, unknown>;
}

function readDeviceConfig(metadata: Record<string, unknown> | undefined): AlexaDeviceConfig | null {
  const raw = metadata?.alexa;
  if (!raw || typeof raw !== "object") return null;
  const config = raw as Partial<AlexaDeviceConfig>;
  if (typeof config.endpointId !== "string" || !Array.isArray(config.capabilities)) return null;
  return config as AlexaDeviceConfig;
}

export class AlexaAdapter implements ConnectorAdapter {
  readonly id = ALEXA_ID;
  readonly label = "Amazon Alexa";
  readonly description =
    "Smart Home Skill bridge so Alexa voice devices + the Alexa app can see and control Clawix things.";

  private session: AlexaSession | null = null;
  private context: AlexaAdapterContext | null = null;

  bindContext(context: AlexaAdapterContext): void {
    this.context = context;
  }

  async connect(credentials: AlexaCredentials): Promise<{ connected: boolean; reason?: string }> {
    if (!credentials.oauthClientSecret) {
      return { connected: false, reason: "OAuth client secret is required." };
    }
    this.session = { credentials };
    return { connected: true };
  }

  disconnect(): void {
    this.session = null;
  }

  authenticate(bearer: string | null): boolean {
    if (!this.session || !bearer) return false;
    return bearer === this.session.credentials.oauthClientSecret;
  }

  handleFulfillment(body: { directive: { header: { namespace: string; name: string; messageId: string; correlationToken?: string }; endpoint?: { endpointId?: string }; payload?: Record<string, unknown> } }): unknown {
    if (!this.session || !this.context) {
      return alexaErrorResponse(body, "INVALID_AUTHORIZATION_CREDENTIAL");
    }
    const namespace = body.directive.header.namespace;
    const name = body.directive.header.name;
    if (namespace === "Alexa.Discovery" && name === "Discover") {
      return this.handleDiscovery(body);
    }
    if (namespace === "Alexa.Authorization" && name === "AcceptGrant") {
      return alexaSuccessResponse(body, "Alexa.Authorization", "AcceptGrant.Response", {});
    }
    if (body.directive.endpoint?.endpointId) {
      return this.handleControl(body);
    }
    return alexaErrorResponse(body, "INVALID_DIRECTIVE");
  }

  private handleDiscovery(body: Parameters<AlexaAdapter["handleFulfillment"]>[0]): unknown {
    if (!this.context) return {};
    const endpoints = this.context
      .resolveThings()
      .map((thing) => {
        const config = readDeviceConfig(thing.metadata);
        if (!config) return null;
        return {
          endpointId: config.endpointId,
          manufacturerName: "Clawix",
          friendlyName: thing.label,
          description: "Clawix-managed device",
          displayCategories: [config.displayCategory],
          capabilities: config.capabilities.map((iface) => ({
            type: "AlexaInterface",
            interface: iface,
            version: "3",
          })),
        };
      })
      .filter((entry): entry is Exclude<typeof entry, null> => entry !== null);
    return {
      event: {
        header: {
          namespace: "Alexa.Discovery",
          name: "Discover.Response",
          payloadVersion: "3",
          messageId: body.directive.header.messageId,
        },
        payload: { endpoints },
      },
    };
  }

  private handleControl(body: Parameters<AlexaAdapter["handleFulfillment"]>[0]): unknown {
    if (!this.context) return {};
    const endpointId = body.directive.endpoint!.endpointId!;
    const thing = this.context
      .resolveThings()
      .find((entry) => readDeviceConfig(entry.metadata)?.endpointId === endpointId);
    if (!thing) {
      return alexaErrorResponse(body, "NO_SUCH_ENDPOINT");
    }
    const mapped = mapAlexaDirective(body.directive.header.namespace, body.directive.header.name, body.directive.payload ?? {});
    if (!mapped) {
      return alexaErrorResponse(body, "INVALID_DIRECTIVE");
    }
    try {
      this.context.runAction({
        thingId: thing.id,
        capability: mapped.capability,
        desired: mapped.value,
        action: mapped.action,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ENDPOINT_UNREACHABLE";
      return alexaErrorResponse(body, "ENDPOINT_UNREACHABLE", message);
    }
    return {
      event: {
        header: {
          namespace: "Alexa",
          name: "Response",
          payloadVersion: "3",
          messageId: body.directive.header.messageId,
          correlationToken: body.directive.header.correlationToken,
        },
        endpoint: { endpointId },
        payload: {},
      },
      context: {
        properties: mapped.properties,
      },
    };
  }

  async dispatch(_context: DispatchContext): Promise<DispatchResult> {
    if (!this.session) {
      throw new Error("alexa: not connected. Run iot.alexa.connect first.");
    }
    return { observedValue: _context.desiredValue };
  }

  async reportState(input: { endpointId: string; properties: Array<Record<string, unknown>> }): Promise<{ pushed: boolean; reason?: string }> {
    if (!this.session) return { pushed: false, reason: "Not connected." };
    if (!this.session.credentials.eventGatewayToken || !this.session.credentials.eventGatewayUrl) {
      return { pushed: false, reason: "Missing event gateway credentials." };
    }
    try {
      const response = await fetch(this.session.credentials.eventGatewayUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.session.credentials.eventGatewayToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: {
            header: {
              namespace: "Alexa",
              name: "ChangeReport",
              messageId: `clawix-${Date.now()}`,
              payloadVersion: "3",
            },
            endpoint: { endpointId: input.endpointId },
            payload: { change: { cause: { type: "PHYSICAL_INTERACTION" }, properties: input.properties } },
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

function alexaErrorResponse(body: Parameters<AlexaAdapter["handleFulfillment"]>[0], errorType: string, message?: string): unknown {
  return {
    event: {
      header: {
        namespace: "Alexa",
        name: "ErrorResponse",
        payloadVersion: "3",
        messageId: body.directive.header.messageId,
        correlationToken: body.directive.header.correlationToken,
      },
      ...(body.directive.endpoint ? { endpoint: body.directive.endpoint } : {}),
      payload: { type: errorType, message: message ?? errorType },
    },
  };
}

function alexaSuccessResponse(body: Parameters<AlexaAdapter["handleFulfillment"]>[0], namespace: string, name: string, payload: Record<string, unknown>): unknown {
  return {
    event: {
      header: {
        namespace,
        name,
        payloadVersion: "3",
        messageId: body.directive.header.messageId,
      },
      payload,
    },
  };
}

function mapAlexaDirective(namespace: string, name: string, payload: Record<string, unknown>):
  | { capability: string; value: unknown; action: string; properties: Array<Record<string, unknown>> }
  | null {
  switch (`${namespace}.${name}`) {
    case "Alexa.PowerController.TurnOn":
      return {
        capability: "power",
        value: true,
        action: "on",
        properties: [{ namespace: "Alexa.PowerController", name: "powerState", value: "ON", timeOfSample: new Date().toISOString() }],
      };
    case "Alexa.PowerController.TurnOff":
      return {
        capability: "power",
        value: false,
        action: "off",
        properties: [{ namespace: "Alexa.PowerController", name: "powerState", value: "OFF", timeOfSample: new Date().toISOString() }],
      };
    case "Alexa.BrightnessController.SetBrightness": {
      const brightness = Number(payload.brightness ?? 0);
      return {
        capability: "brightness",
        value: brightness,
        action: "set",
        properties: [{ namespace: "Alexa.BrightnessController", name: "brightness", value: brightness, timeOfSample: new Date().toISOString() }],
      };
    }
    case "Alexa.LockController.Lock":
      return {
        capability: "lock_state",
        value: "locked",
        action: "lock",
        properties: [{ namespace: "Alexa.LockController", name: "lockState", value: "LOCKED", timeOfSample: new Date().toISOString() }],
      };
    case "Alexa.LockController.Unlock":
      return {
        capability: "lock_state",
        value: "unlocked",
        action: "unlock",
        properties: [{ namespace: "Alexa.LockController", name: "lockState", value: "UNLOCKED", timeOfSample: new Date().toISOString() }],
      };
    default:
      return null;
  }
}
