import { startSecretsServer } from "../server/app.ts";

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
if (flags.workspace) {
  overrides.config = { ...(overrides.config ?? {}), dataDir: flags.workspace, dbPath: `${flags.workspace}/secrets.sqlite` };
}
if (flags["status-file"]) overrides.statusFile = flags["status-file"];

startSecretsServer(overrides)
  .then(({ config }) => {
    console.log(`[secrets] listening on ${config.host}:${config.port} (db: ${config.dbPath})`);
  })
  .catch((err) => {
    console.error("[secrets] startup failed:", err);
    process.exit(1);
  });
