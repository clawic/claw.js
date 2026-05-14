import { startSecretsServer } from "../server/app.ts";

async function readBootstrapConfigFromStdin(): Promise<{ adminToken?: string; signedHostToken?: string; kekBase64?: string }> {
  if (process.env.CLAW_SECRETS_BOOTSTRAP_STDIN !== "1") return {};
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("CLAW_SECRETS_BOOTSTRAP_STDIN was set but no bootstrap payload was received");
  const parsed = JSON.parse(raw) as { adminToken?: unknown; signedHostToken?: unknown; kekBase64?: unknown };
  const adminToken = typeof parsed.adminToken === "string" && parsed.adminToken.length > 0 ? parsed.adminToken : undefined;
  const signedHostToken = typeof parsed.signedHostToken === "string" && parsed.signedHostToken.length > 0 ? parsed.signedHostToken : undefined;
  const kekBase64 = typeof parsed.kekBase64 === "string" && parsed.kekBase64.length > 0 ? parsed.kekBase64 : undefined;
  return { ...(adminToken ? { adminToken } : {}), ...(signedHostToken ? { signedHostToken } : {}), ...(kekBase64 ? { kekBase64 } : {}) };
}

const args = process.argv.slice(2);
const flags: Record<string, string> = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg?.startsWith("--")) {
    const key = arg.slice(2);
    const value = args[i + 1] && !args[i + 1]?.startsWith("--") ? args[i + 1]! : "true";
    flags[key] = value;
    if (value !== "true") i++;
  }
}

const overrides: Parameters<typeof startSecretsServer>[0] = {};
if (flags.port) overrides.config = { ...(overrides.config ?? {}), port: Number(flags.port) };
if (flags.host) overrides.config = { ...(overrides.config ?? {}), host: flags.host };
if (flags.workspace && !process.env.CLAW_SECRETS_DATA_DIR && !process.env.CLAW_SECRETS_DB_PATH) {
  overrides.config = { ...(overrides.config ?? {}), dataDir: flags.workspace, dbPath: `${flags.workspace}/vault.sqlite` };
}
if (flags["status-file"]) overrides.statusFile = flags["status-file"];

const bootstrapConfig = await readBootstrapConfigFromStdin();
if (bootstrapConfig.adminToken || bootstrapConfig.signedHostToken || bootstrapConfig.kekBase64) {
  overrides.config = { ...(overrides.config ?? {}), ...bootstrapConfig };
}

startSecretsServer(overrides)
  .then(({ config }) => {
    console.log(`[secrets] listening on ${config.host}:${config.port} (db: ${config.dbPath})`);
  })
  .catch((err) => {
    console.error("[secrets] startup failed:", err);
    process.exit(1);
  });
