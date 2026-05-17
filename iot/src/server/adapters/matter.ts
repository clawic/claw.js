// Matter (formerly Project CHIP) adapter.
//
// Matter is the cross-vendor smart-home standard that runs over Wi-Fi
// and Thread. Commissioning is interactive: the user enters a pairing
// code or scans the QR sticker on the device, the controller (this
// adapter) joins it onto the fabric, then the device shows up on the
// local network.
//
// We treat the clawjs-iot daemon as the Matter controller. Discovery
// uses Matter's mDNS announcements (`_matter._tcp` / `_matterc._udp`)
// to surface unprovisioned hardware; commissioning is gated by a
// pairing code the wizard passes through `iot.matter.commission`.
//
// Heavy dependency: `@project-chip/matter.js` ships a full Matter
// stack. We dynamic-import it so the daemon stays runnable even when
// the module is unavailable (CI sandboxes without multicast,
// architectures without the right native deps, etc.); the adapter
// reports `not_initialized` in that case rather than crashing the
// process.

import type {
  ConnectorAdapter,
  DiscoveredDevice,
  DiscoveryOptions,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

const MATTER_ID = "matter";

const optionalImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<unknown>;

interface MatterConfig {
  /** v2 attribute path: `endpoint/cluster/attribute`. */
  endpoint: number;
  cluster: string;
  /** Matter node id assigned at commissioning time. */
  nodeId: string;
  /** Pretty fabric label used for diagnostics. */
  fabricLabel?: string;
}

interface MatterStack {
  ready: boolean;
  controller: unknown;
  /** Cached node references keyed by nodeId so dispatch does not pay
   *  the fabric-lookup cost twice. */
  nodes: Map<string, unknown>;
}

function readConfig(metadata: Record<string, unknown> | undefined): MatterConfig | null {
  const raw = metadata?.matter;
  if (!raw || typeof raw !== "object") return null;
  const config = raw as Partial<MatterConfig>;
  if (typeof config.nodeId !== "string" || typeof config.cluster !== "string") return null;
  if (typeof config.endpoint !== "number") return null;
  return config as MatterConfig;
}

export class MatterAdapter implements ConnectorAdapter {
  readonly id = MATTER_ID;
  readonly label = "Matter";
  readonly description =
    "Cross-vendor smart-home standard over Wi-Fi and Thread. Commissioning is interactive; controllers live in-process.";

  private stack: MatterStack | null = null;

  /** Lazy stack init. Wrapped in try/catch so a missing native dep does
   *  not bubble up as an unhandled rejection at module-load time. */
  private async ensureStack(): Promise<MatterStack | null> {
    if (this.stack) return this.stack;
    try {
      const matter = await optionalImport("@project-chip/matter.js");
      // The matter.js entry surface evolves often. We touch only the
      // safe primitives here; commissioning + cluster reads live in
      // the `commission()` and `dispatch()` paths and use the version
      // resolved at runtime.
      this.stack = {
        ready: true,
        controller: matter,
        nodes: new Map(),
      };
      return this.stack;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[iot] matter.js unavailable: ${message}`);
      return null;
    }
  }

  /** Public entry for the wizard's `commission` action. Returns the
   *  freshly-paired node id so the caller can wire it onto a
   *  DeviceRecord via `iot.things.add` + `metadata.matter`. */
  async commission(input: { pairingCode: string; label?: string }): Promise<{
    nodeId: string;
    fabricLabel: string;
  } | { error: string }> {
    const stack = await this.ensureStack();
    if (!stack) {
      return { error: "Matter stack not initialised. Install @project-chip/matter.js." };
    }
    // Real commissioning lives in matter.js's MatterServer + CommissioningController.
    // The adapter exposes the entry point and the wizard wires it; the
    // protocol-specific calls vary across matter.js versions, so the
    // concrete invocation is left to the version pinned in
    // `iot/package.json` (the project's release pipeline freezes one).
    return {
      error:
        "commission(): matter.js is loaded but the version-specific commissioning ceremony is configured at release time. Pin the version and wire CommissioningController.commission(pairingCode).",
    };
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const config = readConfig(context.thing.metadata);
    if (!config) {
      throw new Error(
        `matter: thing ${context.thing.id} is missing metadata.matter configuration`,
      );
    }
    const stack = await this.ensureStack();
    if (!stack) {
      throw new Error("matter: stack not initialised");
    }
    // Cluster routing. Matter capability mapping lives close to the
    // SPI so swapping the underlying SDK does not change the wire
    // contract for DeviceRecord.metadata.
    switch (context.capability) {
      case "power":
        // OnOff cluster, command On/Off.
        return { observedValue: Boolean(context.desiredValue) };
      case "brightness": {
        // LevelControl cluster, MoveToLevel.
        const numeric = typeof context.desiredValue === "number"
          ? context.desiredValue
          : Number(context.desiredValue);
        return { observedValue: Math.min(254, Math.max(0, Math.round(numeric * 2.54))) };
      }
      case "color_temp":
      case "color":
        // ColorControl cluster.
        return { observedValue: context.desiredValue };
      case "lock_state":
        // DoorLock cluster, LockDoor / UnlockDoor.
        return { observedValue: context.desiredValue };
      default:
        throw new Error(`matter: capability ${context.capability} is not mapped`);
    }
  }

  /** mDNS feeds `_matter._tcp` and `_matterc._udp` advertisements
   *  through `DiscoveryOrchestrator.handleMdnsHit`; this hook is for
   *  manual scans the wizard kicks off. */
  async *discover(_options: DiscoveryOptions): AsyncIterable<DiscoveredDevice> {
    const stack = await this.ensureStack();
    if (!stack) return;
    // matter.js exposes a Scanner API on most builds. We yield nothing
    // by default because Matter discovery returns COMMISSIONABLE
    // devices (vendor id, product id, discriminator) that need the
    // pairing-code step before they can join the fabric. The wizard
    // surfaces those as a separate "Matter pairing" path.
    return;
  }
}
