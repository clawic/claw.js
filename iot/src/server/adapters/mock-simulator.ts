// Deterministic in-process simulator. Devices respond instantly with
// exactly the value the agent asked for, optionally with a configurable
// dispatch delay so UI authors can confirm spinners render correctly.
//
// Acts as the fallback connector for the seed dataset and as the
// default for any "Add device manually" flow that does not pick a real
// adapter. Lets the rest of the IoT stack be exercised end-to-end on a
// fresh laptop with no Hue bridge, no MQTT broker, no Wi-Fi devices.

import type {
  ConnectorAdapter,
  DiscoveredDevice,
  DiscoveryOptions,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

const MOCK_SIMULATOR_ID = "mock-simulator";

export class MockSimulatorAdapter implements ConnectorAdapter {
  readonly id = MOCK_SIMULATOR_ID;
  readonly label = "Mock simulator";
  readonly description =
    "Deterministic in-process simulator used for tests, seed data, and offline UI work.";

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    return { observedValue: context.desiredValue };
  }

  /** Yields one synthetic device per common kind so the discovery feed
   *  has something to show on a clean install. Real environments rely
   *  on the protocol-specific adapters; this is for first-launch UX. */
  async *discover(_options: DiscoveryOptions): AsyncIterable<DiscoveredDevice> {
    const at = new Date().toISOString();
    const samples: Array<Pick<DiscoveredDevice, "label" | "kind" | "targetRef">> = [
      { label: "Simulated bedside lamp", kind: "light", targetRef: "sim://light/1" },
      { label: "Simulated kettle switch", kind: "switch", targetRef: "sim://switch/1" },
      { label: "Simulated motion sensor", kind: "sensor", targetRef: "sim://sensor/1" },
    ];
    for (const sample of samples) {
      yield {
        fingerprint: `mock:${sample.targetRef}`,
        connectorId: this.id,
        label: sample.label,
        kind: sample.kind,
        targetRef: sample.targetRef,
        risk: "safe",
        discoveredAt: at,
        metadata: { source: "mock-simulator" },
      };
    }
  }
}
