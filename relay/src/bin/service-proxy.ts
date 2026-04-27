import { startRelayServiceProxy } from "../service-proxy/local.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

const relayUrl = arg("relay-url") ?? process.env.RELAY_URL ?? "http://127.0.0.1:4410";
const tenantId = arg("tenant-id") ?? process.env.RELAY_TENANT_ID ?? "demo-tenant";
const serviceId = arg("service-id") ?? process.env.RELAY_SERVICE_ID;
const email = arg("email") ?? process.env.RELAY_EMAIL ?? "user@relay.local";
const password = arg("password") ?? process.env.RELAY_PASSWORD ?? "relay-user";
const host = arg("host") ?? process.env.RELAY_SERVICE_PROXY_HOST ?? "127.0.0.1";
const port = Number(arg("port") ?? process.env.PORT ?? process.env.RELAY_SERVICE_PROXY_PORT ?? "0");
const uiUrl = arg("ui-url") ?? process.env.RELAY_SERVICE_PROXY_UI_URL;

if (!serviceId) {
  throw new Error("Missing --service-id or RELAY_SERVICE_ID.");
}

const server = await startRelayServiceProxy({
  relayUrl,
  tenantId,
  serviceId,
  email,
  password,
  host,
  port,
  uiUrl,
});

process.stdout.write(`relay service proxy listening on ${server.url}\n`);
if (uiUrl) process.stdout.write(`ui upstream ${uiUrl}\n`);
process.stdout.write(`service ${serviceId} via ${relayUrl}\n`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
