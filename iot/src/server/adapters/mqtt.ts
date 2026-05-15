// MQTT adapter.
//
// Covers two complementary use cases:
//   1. Generic MQTT: a user already has an MQTT broker on their LAN
//      and wants Clawix to publish on a topic when an action fires.
//      Per-device metadata declares the topic and payload templates.
//   2. Zigbee2MQTT auto-detection: when the broker streams events on
//      `zigbee2mqtt/bridge/devices`, the adapter mints DiscoveredDevices
//      for every entry so the wizard can import a whole Zigbee mesh
//      in one step.
//
// Configuration on the device record:
//
//   metadata.mqtt = {
//     "publishTopic": "zigbee2mqtt/lamp_living/set",
//     "payloadTemplate": { "state": "{{value}}" },
//     "subscribeTopic": "zigbee2mqtt/lamp_living"
//   }
//
// Broker connection details live on the connector record, not the
// device record, so a fleet of Zigbee devices share one connection.

import type {
  ConnectorAdapter,
  DiscoveredDevice,
  DiscoveryOptions,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

export const MQTT_ID = "mqtt";

const optionalImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<unknown>;

interface MqttDeviceConfig {
  publishTopic: string;
  payloadTemplate?: unknown;
  subscribeTopic?: string;
  /** Zigbee2MQTT friendly_name when the device came from Z2M
   *  auto-detect. The adapter publishes to
   *  `zigbee2mqtt/<friendly>/set` and listens on `zigbee2mqtt/<friendly>`. */
  z2mFriendly?: string;
}

export interface MqttBrokerConfig {
  url: string;
  username?: string;
  password?: string;
}

interface MqttStack {
  ready: boolean;
  client: unknown;
  broker: MqttBrokerConfig;
  /** Cache of last seen Zigbee2MQTT device list keyed by friendly_name. */
  z2mDevices: Map<string, Record<string, unknown>>;
}

function renderTemplate(template: unknown, desired: unknown): unknown {
  if (typeof template === "string") {
    if (template === "{{value}}") return desired;
    return template.replace(/\{\{\s*value\s*\}\}/g, String(desired));
  }
  if (Array.isArray(template)) return template.map((entry) => renderTemplate(entry, desired));
  if (template && typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template as Record<string, unknown>)) {
      out[k] = renderTemplate(v, desired);
    }
    return out;
  }
  return template;
}

function readConfig(metadata: Record<string, unknown> | undefined): MqttDeviceConfig | null {
  const raw = metadata?.mqtt;
  if (!raw || typeof raw !== "object") return null;
  const config = raw as Partial<MqttDeviceConfig>;
  if (typeof config.publishTopic !== "string" || !config.publishTopic) return null;
  return config as MqttDeviceConfig;
}

export class MqttAdapter implements ConnectorAdapter {
  readonly id = MQTT_ID;
  readonly label = "MQTT / Zigbee2MQTT";
  readonly description =
    "Generic MQTT publisher plus Zigbee2MQTT auto-detection over a user-supplied broker.";

  private stack: MqttStack | null = null;

  /** Wizard entry. The Add-device flow collects the broker URL plus
   *  optional credentials and hands them here; the adapter opens the
   *  connection and starts listening for Zigbee2MQTT topics. */
  async connect(broker: MqttBrokerConfig): Promise<{ connected: boolean; reason?: string }> {
    try {
      const mqtt = await optionalImport("mqtt") as {
        connect: (
          url: string,
          options: Record<string, unknown>,
        ) => {
          on: (event: string, callback: (...args: never[]) => void) => void;
          subscribe: (topic: string) => void;
          publish?: (topic: string, payload: string) => void;
          end?: (force?: boolean) => void;
        };
      };
      const client = mqtt.connect(broker.url, {
        ...(broker.username ? { username: broker.username } : {}),
        ...(broker.password ? { password: broker.password } : {}),
        reconnectPeriod: 5_000,
        connectTimeout: 8_000,
      });
      this.stack = { ready: true, client, broker, z2mDevices: new Map() };
      // Listen for Zigbee2MQTT's bridge devices manifest so discovery
      // surfaces every paired Zigbee endpoint without us having to
      // walk individual topics.
      client.on("connect", () => {
        client.subscribe("zigbee2mqtt/bridge/devices");
      });
      client.on("message", (...args: never[]) => {
        const [topic, payload] = args as unknown as [string, Buffer];
        if (topic !== "zigbee2mqtt/bridge/devices") return;
        try {
          const list = JSON.parse(payload.toString()) as Array<Record<string, unknown>>;
          this.stack!.z2mDevices.clear();
          for (const entry of list) {
            const friendly = entry.friendly_name as string | undefined;
            if (friendly) this.stack!.z2mDevices.set(friendly, entry);
          }
        } catch {
          // Malformed payload — ignore; the next manifest will heal.
        }
      });
      return { connected: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { connected: false, reason };
    }
  }

  async disconnect(): Promise<void> {
    if (!this.stack) return;
    const client = this.stack.client as { end?: (force?: boolean) => void };
    client.end?.(true);
    this.stack = null;
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const config = readConfig(context.thing.metadata);
    if (!config) {
      throw new Error(
        `mqtt: thing ${context.thing.id} is missing metadata.mqtt configuration`,
      );
    }
    if (!this.stack) {
      throw new Error("mqtt: not connected. Call iot.mqtt.connect with the broker URL first.");
    }
    const payload = config.payloadTemplate
      ? renderTemplate(config.payloadTemplate, context.desiredValue)
      : { state: context.desiredValue };
    const client = this.stack.client as {
      publish?: (topic: string, payload: string) => void;
    };
    if (!client.publish) {
      throw new Error("mqtt: client missing publish surface");
    }
    client.publish(config.publishTopic, JSON.stringify(payload));
    return { observedValue: context.desiredValue };
  }

  /** Discovery yields the Zigbee2MQTT manifest cached on connect.
   *  When the broker is not connected we yield nothing — the wizard
   *  treats that as "user has not pointed at a broker yet" and
   *  surfaces a connect form. */
  async *discover(_options: DiscoveryOptions): AsyncIterable<DiscoveredDevice> {
    if (!this.stack) return;
    const at = new Date().toISOString();
    for (const [friendly, entry] of this.stack.z2mDevices.entries()) {
      const kind = inferKindFromZ2MEntry(entry);
      yield {
        fingerprint: `mqtt:z2m:${friendly}`,
        connectorId: MQTT_ID,
        label: friendly,
        kind,
        targetRef: `zigbee2mqtt/${friendly}`,
        risk: "safe",
        discoveredAt: at,
        metadata: {
          source: "zigbee2mqtt",
          friendly_name: friendly,
          definition: entry.definition ?? null,
          mqtt: {
            publishTopic: `zigbee2mqtt/${friendly}/set`,
            subscribeTopic: `zigbee2mqtt/${friendly}`,
            z2mFriendly: friendly,
          },
        },
      };
    }
  }
}

function inferKindFromZ2MEntry(entry: Record<string, unknown>): DiscoveredDevice["kind"] {
  const definition = entry.definition as Record<string, unknown> | undefined;
  const exposed = (definition?.exposes as Array<Record<string, unknown>> | undefined) ?? [];
  const types = new Set(exposed.map((e) => String(e.type ?? "")));
  if (types.has("light")) return "light";
  if (types.has("switch")) return "switch";
  if (types.has("climate")) return "climate";
  if (types.has("cover")) return "cover";
  if (types.has("lock")) return "lock";
  return "sensor";
}
