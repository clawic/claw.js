const STABLE_EVENT_TYPES = {
  iotDiscoveryFound: "iot.discovery.found",
} as const;
// Discovery orchestrator.
//
// Two complementary discovery paths converge here:
//   1. mDNS (`bonjour-service`) — local-network service advertisements
//      (`_hue._tcp`, `_esphomelib._tcp`, `_shelly._tcp`, `_airplay._tcp`,
//      `_homekit._tcp`, ...). Cheap, automatic, runs whenever the user
//      opens the Add-device wizard or asks the agent to scan.
//   2. Adapter-specific `discover()` iterators — pull-based scans for
//      protocols that cannot rely on mDNS (cloud adapters, MQTT brokers
//      with topic listings, BLE peripheral scans, etc.).
//
// The orchestrator keeps an in-memory snapshot of every device seen
// during the current scan window. `iot.discovery.list` returns the
// snapshot; `iot.discovery.start` opens the window and broadcasts
// `iot.discovery.found` SSE events as devices arrive; `iot.things.add`
// reads the snapshot to lift a device into a permanent DeviceRecord.

import type { AdapterRegistry } from "./adapters/registry.ts";
import type {
  ConnectorAdapter,
  DiscoveredDevice,
  DiscoveryOptions,
} from "./adapters/types.ts";
import type { IotRealtimeHub } from "./realtime.ts";

interface BonjourBrowser {
  stop?: () => void;
}

interface BonjourService {
  addresses?: string[];
  host?: string;
  fqdn?: string;
  name?: string;
  type?: string;
  port?: number;
  txt?: Record<string, unknown>;
}

interface BonjourLike {
  find(options: { type: string }, onUp: (service: BonjourService) => void): BonjourBrowser;
  destroy?: () => void;
}

/** mDNS service type → adapter id mapping. The orchestrator forwards
 *  bonjour hits to the matching adapter for protocol-specific probing. */
const MDNS_PROTOCOLS: Array<{ type: string; connectorId: string; kind: DiscoveredDevice["kind"] }> = [
  { type: "hue", connectorId: "hue-local", kind: "light" },
  { type: "esphomelib", connectorId: "generic-http", kind: "switch" },
  { type: "shelly", connectorId: "generic-http", kind: "switch" },
  { type: "airplay", connectorId: "generic-http", kind: "media" },
  { type: "homekit", connectorId: "homekit", kind: "switch" },
];

export interface DiscoveryEvent {
  device: DiscoveredDevice;
  /** "mdns" when the orchestrator's mDNS browser saw it, "adapter" when
   *  an adapter's discover() yielded it. */
  source: "mdns" | "adapter";
}

export class DiscoveryOrchestrator {
  private snapshot = new Map<string, DiscoveredDevice>();
  private bonjour: BonjourLike | null = null;
  private browsers: Array<{ stop: () => void }> = [];
  private scanning = false;
  private scanStartedAt: string | null = null;

  constructor(
    private readonly registry: AdapterRegistry,
    private readonly realtime: IotRealtimeHub,
    private readonly defaultHomeId: () => string,
  ) {}

  isScanning(): boolean {
    return this.scanning;
  }

  list(): DiscoveredDevice[] {
    return Array.from(this.snapshot.values()).sort(
      (a, b) => a.discoveredAt.localeCompare(b.discoveredAt),
    );
  }

  get(fingerprint: string): DiscoveredDevice | undefined {
    return this.snapshot.get(fingerprint);
  }

  clear(): void {
    this.snapshot.clear();
  }

  async start(options: DiscoveryOptions = {}): Promise<{ started: boolean; reason?: string }> {
    if (this.scanning) {
      return { started: false, reason: "Discovery already in progress." };
    }
    this.scanning = true;
    this.scanStartedAt = new Date().toISOString();
    this.snapshot.clear();

    // mDNS browsers. Best-effort: if `bonjour-service` is not
    // installable in this environment (sandbox, no multicast) we log
    // and continue — adapter-specific discovery still works.
    try {
      const mod = await import("bonjour-service");
      const candidates = mod as {
        default?: (() => BonjourLike) | (new () => BonjourLike);
        Bonjour?: new () => BonjourLike;
      };
      const defaultExport = candidates.default;
      if (candidates.Bonjour) {
        this.bonjour = new candidates.Bonjour();
      } else if (typeof defaultExport === "function") {
        this.bonjour = defaultExport();
      } else {
        throw new Error("bonjour-service did not expose a factory");
      }
      for (const entry of MDNS_PROTOCOLS) {
        const browser = this.bonjour.find({ type: entry.type }, (service: BonjourService) => {
          this.handleMdnsHit(entry.connectorId, entry.kind, service);
        });
        this.browsers.push({ stop: () => browser.stop?.() });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[iot] mDNS browser unavailable: ${message}`);
    }

    // Adapter-driven discovery: kick each adapter that implements
    // `discover()` and merge into the snapshot. Bounded by the
    // caller's timeoutMs to keep the window short on slow networks.
    const timeoutMs = options.timeoutMs ?? 8_000;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const adapters = this.registry.list().filter((adapter) => typeof adapter.discover === "function");
      await Promise.all(adapters.map((adapter) => this.runAdapterDiscovery(adapter, abort.signal, options.kind)));
    } finally {
      clearTimeout(timer);
    }

    return { started: true };
  }

  stop(): void {
    if (!this.scanning) return;
    for (const browser of this.browsers) browser.stop();
    this.browsers = [];
    try {
      this.bonjour?.destroy();
    } catch {
      // bonjour-service emits errors on tear-down when no advertisements
      // were issued; swallow them so stop() stays idempotent.
    }
    this.bonjour = null;
    this.scanning = false;
    this.scanStartedAt = null;
  }

  private handleMdnsHit(connectorId: string, kind: DiscoveredDevice["kind"], service: BonjourService): void {
    const address = service.addresses?.[0] ?? service.host ?? service.fqdn;
    const fingerprint = `mdns:${connectorId}:${service.fqdn ?? service.name}`;
    const device: DiscoveredDevice = {
      fingerprint,
      connectorId,
      label: service.name ?? service.fqdn ?? `mDNS ${service.type}`,
      kind,
      targetRef: address ?? "",
      risk: "safe",
      discoveredAt: new Date().toISOString(),
      metadata: {
        source: "mdns",
        type: service.type,
        port: service.port,
        txt: service.txt,
      },
    };
    this.snapshot.set(fingerprint, device);
    this.broadcast(device, "mdns");
  }

  private async runAdapterDiscovery(
    adapter: ConnectorAdapter,
    signal: AbortSignal,
    kind?: DiscoveredDevice["kind"],
  ): Promise<void> {
    if (!adapter.discover) return;
    try {
      for await (const device of adapter.discover({ signal, kind })) {
        if (signal.aborted) break;
        this.snapshot.set(device.fingerprint, device);
        this.broadcast(device, "adapter");
      }
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[iot] adapter ${adapter.id} discovery failed: ${message}`);
    }
  }

  private broadcast(device: DiscoveredDevice, source: DiscoveryEvent["source"]): void {
    const homeId = this.defaultHomeId();
    this.realtime.broadcast({
      id: `disc_${device.fingerprint}`,
      homeId,
      type: STABLE_EVENT_TYPES.iotDiscoveryFound,
      payload: { device, source, scanStartedAt: this.scanStartedAt },
      createdAt: device.discoveredAt,
    });
  }
}
