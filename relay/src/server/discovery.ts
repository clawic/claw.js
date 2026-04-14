import { networkInterfaces } from "node:os";
import { Bonjour } from "bonjour-service";
import type { RelayConfig } from "./config.ts";

let instance: Bonjour | null = null;

/** Advertise the relay via mDNS so LAN clients can auto-discover it. */
export function advertiseRelay(config: RelayConfig): void {
  const port = config.port;
  const host = localIPv4() ?? "127.0.0.1";
  const publicUrl = `http://${host}:${port}`;

  instance = new Bonjour();
  instance.publish({
    name: "ClawJS Relay",
    type: "clawjs",
    port,
    txt: {
      url: publicUrl,
      tenantId: "demo-tenant",
    },
  });

  console.log(`[relay] mDNS: advertising _clawjs._tcp on ${host}:${port}`);
}

export function stopAdvertising(): void {
  if (instance) {
    instance.unpublishAll();
    instance.destroy();
    instance = null;
  }
}

function localIPv4(): string | null {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.internal && entry.family === "IPv4") {
        return entry.address;
      }
    }
  }
  return null;
}
