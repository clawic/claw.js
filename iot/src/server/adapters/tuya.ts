// Tuya Cloud OpenAPI adapter.
//
// Tuya is the OEM behind a huge slice of cheap Wi-Fi smart-home gear
// sold under Smart Life / Action / Lidl / Brilliant / hundreds of
// vendor labels. The Cloud OpenAPI is the canonical control surface;
// per-device local control over UDP is available too but the local
// protocol is unstable across firmware versions and requires per-device
// local keys, so V1 routes everything through the cloud.
//
// Authentication uses HMAC-SHA256 signed requests with a client id +
// client secret the user creates in the Tuya IoT Platform console.
// Tokens are short-lived (about 2 hours) so the adapter refreshes
// automatically before each dispatch.
//
// Constitution caveats:
//   - Cloud adapters live behind the user-controlled boundary
//     (constitution II.5: copy inherits protection). Tokens are kept
//     in memory here; production deploys must persist them in the
//     SecretsVault. The wizard surfaces this when the user enters
//     credentials.
//   - Every dispatch leaves the device (the command goes to Tuya's
//     servers first). The policy gate evaluates each `runAction` so
//     restricted-risk targets still flow through the approval queue.

import { createHash, createHmac } from "node:crypto";

import type {
  ConnectorAdapter,
  DiscoveredDevice,
  DiscoveryOptions,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

export const TUYA_ID = "tuya";

/** Per-device pointer to a Tuya cloud device. `code` is the dp code
 *  the Tuya schema declares for the capability we want to write. */
interface TuyaDeviceConfig {
  deviceId: string;
  /** Tuya schema status / function code, e.g. `switch_1`, `bright_value`,
   *  `temp_value`, `colour_data`. */
  code: string;
}

export interface TuyaCredentials {
  appKey: string;
  appSecret: string;
  /** Datacenter base URL. Tuya hosts EU / US / IN / CN regions; the
   *  IoT platform displays the right one next to the project. */
  baseUrl?: string;
}

interface TuyaSession {
  credentials: TuyaCredentials;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function readDeviceConfig(metadata: Record<string, unknown> | undefined): TuyaDeviceConfig | null {
  const raw = metadata?.tuya;
  if (!raw || typeof raw !== "object") return null;
  const config = raw as Partial<TuyaDeviceConfig>;
  if (typeof config.deviceId !== "string" || typeof config.code !== "string") return null;
  return config as TuyaDeviceConfig;
}

/** SHA-256 of a request body, lowercase hex. Tuya signing requires
 *  this even for GETs (the SHA of the empty string is well-defined). */
function bodyDigest(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function nonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class TuyaAdapter implements ConnectorAdapter {
  readonly id = TUYA_ID;
  readonly label = "Tuya / Smart Life";
  readonly description =
    "OEM behind Smart Life and many white-label Wi-Fi devices. Cloud OpenAPI with HMAC-signed requests.";

  private session: TuyaSession | null = null;

  /** Wizard entry: exchange the user's client credentials for an
   *  access token. Persists the session in memory so subsequent
   *  dispatches can reuse the token until it expires. */
  async connect(credentials: TuyaCredentials): Promise<{ connected: boolean; expiresAt?: number; reason?: string }> {
    const base = credentials.baseUrl ?? "https://openapi.tuyaeu.com";
    try {
      const path = "/v1.0/token?grant_type=1";
      const ts = Date.now();
      const n = nonce();
      const sign = this.sign({
        method: "GET",
        path,
        body: "",
        timestamp: ts,
        nonce: n,
        credentials,
      });
      const response = await fetch(new URL(path, base), {
        method: "GET",
        headers: {
          client_id: credentials.appKey,
          sign,
          t: String(ts),
          sign_method: "HMAC-SHA256",
          nonce: n,
        },
      });
      const json = (await response.json()) as {
        success?: boolean;
        msg?: string;
        result?: { access_token: string; refresh_token: string; expire_time: number };
      };
      if (!json.success || !json.result) {
        return { connected: false, reason: json.msg ?? `HTTP ${response.status}` };
      }
      this.session = {
        credentials: { ...credentials, baseUrl: base },
        accessToken: json.result.access_token,
        refreshToken: json.result.refresh_token,
        expiresAt: Date.now() + json.result.expire_time * 1000 - 60_000,
      };
      return { connected: true, expiresAt: this.session.expiresAt };
    } catch (error) {
      return { connected: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  disconnect(): void {
    this.session = null;
  }

  /** Pulls the current device list from the Tuya cloud. Each device
   *  surfaces as a DiscoveredDevice the wizard can promote into a
   *  device record. */
  async syncDevices(): Promise<{ devices: DiscoveredDevice[] } | { error: string }> {
    if (!this.session) return { error: "Tuya not connected. Run iot.tuya.connect first." };
    await this.refreshIfNeeded();
    const path = `/v1.0/users/me/devices`;
    try {
      const response = await this.signedFetch("GET", path);
      const json = (await response.json()) as {
        success?: boolean;
        result?: Array<{
          id: string;
          name: string;
          category: string;
          local_key?: string;
        }>;
        msg?: string;
      };
      if (!json.success || !json.result) {
        return { error: json.msg ?? `HTTP ${response.status}` };
      }
      const at = new Date().toISOString();
      const devices: DiscoveredDevice[] = json.result.map((device) => ({
        fingerprint: `tuya:${device.id}`,
        connectorId: TUYA_ID,
        label: device.name,
        kind: inferKindFromCategory(device.category),
        targetRef: device.id,
        risk: "caution",
        discoveredAt: at,
        metadata: {
          source: "tuya-cloud",
          category: device.category,
          tuya: { deviceId: device.id, code: defaultCodeForCategory(device.category) },
        },
      }));
      return { devices };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const config = readDeviceConfig(context.thing.metadata);
    if (!config) {
      throw new Error(`tuya: thing ${context.thing.id} is missing metadata.tuya configuration`);
    }
    if (!this.session) {
      throw new Error("tuya: not connected. Run iot.tuya.connect first.");
    }
    await this.refreshIfNeeded();
    const body = JSON.stringify({
      commands: [{ code: config.code, value: context.desiredValue }],
    });
    const path = `/v1.0/iot-03/devices/${config.deviceId}/commands`;
    const response = await this.signedFetch("POST", path, body);
    const json = (await response.json()) as { success?: boolean; msg?: string };
    if (!json.success) {
      throw new Error(`tuya: ${json.msg ?? `HTTP ${response.status}`}`);
    }
    return { observedValue: context.desiredValue };
  }

  /** Yields nothing on a cold scan because the cloud sync is
   *  explicit. The wizard renders a separate "Sync Tuya devices"
   *  button that calls `syncDevices()` and feeds the orchestrator
   *  snapshot via the realtime stream. */
  async *discover(_options: DiscoveryOptions): AsyncIterable<DiscoveredDevice> {
    return;
  }

  // MARK: - Signing helpers

  private async refreshIfNeeded(): Promise<void> {
    if (!this.session) return;
    if (Date.now() < this.session.expiresAt) return;
    const path = `/v1.0/token/${this.session.refreshToken}`;
    const response = await this.signedFetch("GET", path, "", { useToken: false });
    const json = (await response.json()) as {
      success?: boolean;
      result?: { access_token: string; refresh_token: string; expire_time: number };
    };
    if (!json.success || !json.result) {
      throw new Error("tuya: token refresh failed");
    }
    this.session = {
      ...this.session,
      accessToken: json.result.access_token,
      refreshToken: json.result.refresh_token,
      expiresAt: Date.now() + json.result.expire_time * 1000 - 60_000,
    };
  }

  private async signedFetch(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body = "",
    options: { useToken?: boolean } = {},
  ): Promise<Response> {
    if (!this.session) throw new Error("tuya: not connected");
    const useToken = options.useToken !== false;
    const ts = Date.now();
    const n = nonce();
    const sign = this.sign({
      method,
      path,
      body,
      timestamp: ts,
      nonce: n,
      credentials: this.session.credentials,
      accessToken: useToken ? this.session.accessToken : undefined,
    });
    const headers: Record<string, string> = {
      client_id: this.session.credentials.appKey,
      sign,
      t: String(ts),
      sign_method: "HMAC-SHA256",
      nonce: n,
    };
    if (useToken) headers.access_token = this.session.accessToken;
    if (body) headers["Content-Type"] = "application/json";
    return fetch(new URL(path, this.session.credentials.baseUrl!), {
      method,
      headers,
      body: body || undefined,
    });
  }

  private sign(input: {
    method: string;
    path: string;
    body: string;
    timestamp: number;
    nonce: string;
    credentials: TuyaCredentials;
    accessToken?: string;
  }): string {
    // Tuya v3 signing: stringToSign = METHOD + "\n" + SHA256(body) + "\n" + headers + "\n" + url
    // signBase = clientId + accessToken + timestamp + nonce + stringToSign
    // sign = HMAC-SHA256(signBase, clientSecret), uppercased hex.
    const stringToSign = `${input.method}\n${bodyDigest(input.body)}\n\n${input.path}`;
    const signBase =
      input.credentials.appKey +
      (input.accessToken ?? "") +
      String(input.timestamp) +
      input.nonce +
      stringToSign;
    return createHmac("sha256", input.credentials.appSecret)
      .update(signBase)
      .digest("hex")
      .toUpperCase();
  }
}

function inferKindFromCategory(category: string): DiscoveredDevice["kind"] {
  switch (category) {
    case "dj":
    case "dd":
    case "fwd":
    case "ykq":
      return "light";
    case "kg":
    case "cz":
    case "pc":
      return "switch";
    case "wk":
    case "rs":
      return "climate";
    case "cl":
      return "cover";
    case "ms":
    case "jtmsbh":
      return "lock";
    case "sp":
    case "spxj":
      return "camera";
    case "mb":
    case "fs":
      return "media";
    case "sd":
      return "vacuum";
    case "qn":
      return "presence";
    case "dlq":
    case "mcs":
      return "energy";
    default:
      return "sensor";
  }
}

function defaultCodeForCategory(category: string): string {
  switch (category) {
    case "kg":
    case "cz":
    case "pc":
      return "switch_1";
    case "dj":
    case "dd":
    case "fwd":
      return "switch_led";
    case "wk":
    case "rs":
      return "temp_set";
    case "cl":
      return "control";
    case "ms":
    case "jtmsbh":
      return "lock";
    default:
      return "switch_1";
  }
}
