// Generic HTTP connector.
//
// Suitable for any device whose vendor exposes an HTTP REST API the
// user can describe in configuration: ESPHome, Shelly, Tasmota, custom
// firmware, garage controllers, anything that can be hit with a URL.
//
// Configuration is stored on `ThingRecord.metadata.httpAdapter` and
// describes per-capability mappings: which URL to hit, which HTTP
// verb, how to render the desired value into the payload, and how to
// parse the response into an observed value. Example metadata blob:
//
//   {
//     "httpAdapter": {
//       "baseUrl": "http://192.168.1.42",
//       "auth": { "kind": "bearer", "token": "..." },
//       "capabilities": {
//         "power": {
//           "set": {
//             "method": "POST",
//             "path": "/relay/0",
//             "body": { "turn": "{{value}}" }
//           },
//           "get": {
//             "method": "GET",
//             "path": "/relay/0",
//             "responsePath": "ison"
//           }
//         }
//       }
//     }
//   }
//
// Keeping configuration declarative on the thing record means users can
// add new devices without writing TypeScript, and the Phase 3 wizard
// can author this blob from a small form.

import type {
  ConnectorAdapter,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

const GENERIC_HTTP_ID = "generic-http";

interface CapabilityHook {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  /** Body template. `{{value}}` is replaced with the desired value
   *  serialized as JSON. Nested templates such as
   *  `{ "state": "{{value}}" }` work because we walk the object. */
  body?: unknown;
  /** Dot-separated path into the JSON response that holds the observed
   *  value. Omitted for endpoints that respond with the value at the
   *  top level. */
  responsePath?: string;
  /** Optional headers merged on top of the per-thing defaults. */
  headers?: Record<string, string>;
}

interface AdapterConfig {
  baseUrl: string;
  auth?:
    | { kind: "bearer"; token: string }
    | { kind: "basic"; username: string; password: string }
    | { kind: "header"; name: string; value: string }
    | { kind: "none" };
  /** Default headers applied to every request. */
  defaultHeaders?: Record<string, string>;
  capabilities: Record<string, { set?: CapabilityHook; get?: CapabilityHook }>;
}

function readConfig(metadata: Record<string, unknown> | undefined): AdapterConfig | null {
  const raw = metadata?.httpAdapter;
  if (!raw || typeof raw !== "object") return null;
  const config = raw as Partial<AdapterConfig>;
  if (typeof config.baseUrl !== "string" || !config.baseUrl) return null;
  if (!config.capabilities || typeof config.capabilities !== "object") return null;
  return config as AdapterConfig;
}

function authorize(config: AdapterConfig, headers: Headers): void {
  const auth = config.auth ?? { kind: "none" };
  switch (auth.kind) {
    case "bearer":
      headers.set("Authorization", `Bearer ${auth.token}`);
      break;
    case "basic":
      headers.set(
        "Authorization",
        `Basic ${Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64")}`,
      );
      break;
    case "header":
      headers.set(auth.name, auth.value);
      break;
    case "none":
      break;
  }
}

function renderTemplate(value: unknown, desired: unknown): unknown {
  if (typeof value === "string") {
    if (value === "{{value}}") return desired;
    return value.replace(/\{\{\s*value\s*\}\}/g, String(desired));
  }
  if (Array.isArray(value)) return value.map((entry) => renderTemplate(entry, desired));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = renderTemplate(entry, desired);
    }
    return out;
  }
  return value;
}

function extractValue(payload: unknown, path?: string): unknown {
  if (!path) return payload;
  if (payload == null || typeof payload !== "object") return payload;
  let current: unknown = payload;
  for (const segment of path.split(".").filter(Boolean)) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export class GenericHTTPAdapter implements ConnectorAdapter {
  readonly id = GENERIC_HTTP_ID;
  readonly label = "Generic HTTP";
  readonly description =
    "Configurable HTTP connector. Drives any device whose vendor exposes a documented REST surface.";

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const config = readConfig(context.thing.metadata);
    if (!config) {
      throw new Error(
        `generic-http: thing ${context.thing.id} is missing metadata.httpAdapter configuration`,
      );
    }
    const hook = config.capabilities[context.capability]?.set;
    if (!hook) {
      throw new Error(
        `generic-http: no 'set' hook for capability ${context.capability} on ${context.thing.label}`,
      );
    }

    const url = new URL(hook.path, config.baseUrl);
    const headers = new Headers();
    for (const [key, value] of Object.entries(config.defaultHeaders ?? {})) {
      headers.set(key, value);
    }
    for (const [key, value] of Object.entries(hook.headers ?? {})) {
      headers.set(key, value);
    }
    authorize(config, headers);

    const method = hook.method ?? "POST";
    const init: RequestInit = { method, headers, signal: context.signal };
    if (hook.body !== undefined) {
      headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
      init.body = JSON.stringify(renderTemplate(hook.body, context.desiredValue));
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`generic-http: ${method} ${url} returned ${response.status}`);
    }
    if (response.status === 204) {
      return { observedValue: context.desiredValue };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await response.json()) as unknown;
      return { observedValue: extractValue(json, hook.responsePath) };
    }
    const text = await response.text();
    return { observedValue: text.trim() };
  }
}
