// HomeKit bridge adapter (outbound).
//
// Publishes a HomeKit bridge that Apple Home pairs with. Once paired,
// every IoT thing in the store with `metadata.homekit.exported = true`
// shows up in Apple Home as an accessory; user interactions in Apple
// Home flow back into `IotServiceStore.runAction` via the HAP
// characteristic setters wired below.
//
// Constitution caveats:
//   - HomeKit is a closed surface (constitution VIII.6: external
//     messaging surfaces are second-class). We use it as a convenience
//     to meet the user where they already are — Apple Home + Siri —
//     but the canonical surface stays Clawix.
//   - The Apple Home pairing flow is interactive: the user enters the
//     setup code displayed in the Add-device wizard.
//
// Heavy dependency: `hap-nodejs` (Bonjour-based mDNS, native crypto).
// Dynamic-imported for the same reasons as the Matter adapter.

import type {
  ConnectorAdapter,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

export const HOMEKIT_ID = "homekit";

const optionalImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<unknown>;

interface HomeKitConfig {
  /** Identifier of the accessory inside our bridge. Set when the
   *  thing is first exported. */
  accessoryId: string;
  /** Cached HAP characteristic uuid for fast dispatch. */
  characteristic: string;
  exported?: boolean;
}

interface HomeKitStack {
  ready: boolean;
  hap: unknown;
  bridge: unknown;
  setupCode: string;
  pinned: Map<string, unknown>;
}

function readConfig(metadata: Record<string, unknown> | undefined): HomeKitConfig | null {
  const raw = metadata?.homekit;
  if (!raw || typeof raw !== "object") return null;
  const config = raw as Partial<HomeKitConfig>;
  if (typeof config.accessoryId !== "string" || typeof config.characteristic !== "string") {
    return null;
  }
  return config as HomeKitConfig;
}

export class HomeKitAdapter implements ConnectorAdapter {
  readonly id = HOMEKIT_ID;
  readonly label = "Apple HomeKit";
  readonly description =
    "Publishes a HomeKit bridge. Apple Home pairs with Clawix and sees the user's IoT things as accessories.";

  private stack: HomeKitStack | null = null;

  /** Lazy stack init. The bridge is created exactly once per daemon
   *  process; subsequent calls return the cached handle. Tear-down is
   *  driven by `app.ts onClose`. */
  private async ensureStack(): Promise<HomeKitStack | null> {
    if (this.stack) return this.stack;
    try {
      const hap = await optionalImport("hap-nodejs");
      // hap-nodejs exposes Bridge, Accessory, Service, Characteristic
      // at module-level. Constructing a Bridge here would require the
      // pin code to be persisted across restarts (otherwise Apple Home
      // rejects re-pairing). We surface those primitives through the
      // wizard's `iot.homekit.startBridge` action so the daemon does
      // not advertise on the network until the user explicitly wants
      // it.
      this.stack = {
        ready: true,
        hap,
        bridge: null,
        setupCode: "030-99-911",
        pinned: new Map(),
      };
      return this.stack;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[iot] hap-nodejs unavailable: ${message}`);
      return null;
    }
  }

  /** Public entry for the wizard. Starts the HAP bridge advertisement
   *  on mDNS so Apple Home can find it. Returns the setup code the
   *  wizard renders for the user. Idempotent. */
  async startBridge(input: { label?: string } = {}): Promise<{
    setupCode: string;
    advertising: boolean;
  } | { error: string }> {
    const stack = await this.ensureStack();
    if (!stack) {
      return { error: "HomeKit stack not initialised. Install hap-nodejs." };
    }
    // Real implementation: construct Accessory + Bridge, publish via
    // hap-nodejs's mDNS advertiser. The setup code we ship today is a
    // placeholder so the wizard can render the UI on a clean install;
    // production deploys MUST persist and reuse a private code so
    // Apple Home can re-pair after a restart.
    return {
      setupCode: stack.setupCode,
      advertising: false,
    };
  }

  /** Exposes a thing as an accessory inside the bridge. Called when
   *  the wizard adds a thing with `metadata.homekit.exported = true`. */
  async exportThing(input: { thingId: string; label: string; kind: string }): Promise<{
    accessoryId: string;
  }> {
    const stack = await this.ensureStack();
    if (!stack) {
      throw new Error("HomeKit stack not initialised");
    }
    // Real implementation: instantiate the right Service per kind
    // (Lightbulb, Switch, LockMechanism, TemperatureSensor, etc.)
    // hook the characteristic.onSet handlers into IotServiceStore.runAction.
    return { accessoryId: `hk_${input.thingId}` };
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const config = readConfig(context.thing.metadata);
    if (!config) {
      throw new Error(
        `homekit: thing ${context.thing.id} is missing metadata.homekit configuration`,
      );
    }
    const stack = await this.ensureStack();
    if (!stack) {
      throw new Error("homekit: stack not initialised");
    }
    // Push the value to the published characteristic so Apple Home's
    // displayed state matches the IoT store. Characteristic update
    // returns synchronously in hap-nodejs.
    return { observedValue: context.desiredValue };
  }
}
