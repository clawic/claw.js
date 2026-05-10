import { Bonjour, type Service } from "bonjour-service";

export const BRIDGE_BONJOUR_TYPE = "clawix-bridge";
export const BRIDGE_BONJOUR_PROTOCOL = "tcp";

export interface BridgeAnnouncementTxt {
  nodeId: string;
  displayName: string;
  bridgePort: number;
  httpPort: number;
  version?: string;
}

export interface BridgeAnnouncement {
  service: Service;
  stop(): Promise<void>;
}

export class BonjourAnnouncer {
  private readonly bonjour: Bonjour;
  private current: BridgeAnnouncement | null = null;

  constructor(bonjour?: Bonjour) {
    this.bonjour = bonjour ?? new Bonjour();
  }

  announce(opts: {
    name: string;
    bridgePort: number;
    httpPort: number;
    nodeId: string;
    displayName: string;
    version?: string;
  }): BridgeAnnouncement {
    if (this.current) {
      throw new Error("BonjourAnnouncer already has an active announcement");
    }
    const txt: BridgeAnnouncementTxt = {
      nodeId: opts.nodeId,
      displayName: opts.displayName,
      bridgePort: opts.bridgePort,
      httpPort: opts.httpPort,
      version: opts.version,
    };
    const service = this.bonjour.publish({
      name: opts.name,
      type: BRIDGE_BONJOUR_TYPE,
      protocol: BRIDGE_BONJOUR_PROTOCOL,
      port: opts.bridgePort,
      txt: serializeTxt(txt),
    });
    const announcement: BridgeAnnouncement = {
      service,
      stop: () =>
        new Promise<void>((resolve) => {
          service.stop?.(() => resolve());
        }),
    };
    this.current = announcement;
    return announcement;
  }

  async destroy(): Promise<void> {
    if (this.current) {
      await this.current.stop();
      this.current = null;
    }
    this.bonjour.destroy();
  }
}

function serializeTxt(txt: BridgeAnnouncementTxt): Record<string, string> {
  const out: Record<string, string> = {
    nodeId: txt.nodeId,
    displayName: txt.displayName,
    bridgePort: String(txt.bridgePort),
    httpPort: String(txt.httpPort),
  };
  if (txt.version) out.version = txt.version;
  return out;
}
