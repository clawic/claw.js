import { VoiceApiClient, buildVoiceApp } from "@clawjs/voice";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]; if (!token?.startsWith("--")) continue;
    const eq = token.indexOf("="); if (eq > 2) { flags[token.slice(2, eq)] = token.slice(eq + 1); continue; }
    const next = argv[i + 1]; if (!next || next.startsWith("--")) { flags[token.slice(2)] = "true"; continue; }
    flags[token.slice(2)] = next; i++;
  }
  return flags;
}
function positionals(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]; if (!token.startsWith("--")) { out.push(token); continue; }
    if (token.includes("=")) continue; const next = argv[i + 1]; if (next && !next.startsWith("--")) i++;
  }
  return out;
}
function write(p: unknown): void { process.stdout.write(`${typeof p === "string" ? p : JSON.stringify(p, null, 2)}\n`); }

const argv = process.argv.slice(2);
const flags = parseFlags(argv);
const [group] = positionals(argv);
if (!group || argv.includes("--help")) {
  process.stdout.write([
    "Usage: voice <command> [options]",
    "  voice serve [--port N] [--secret TOKEN]",
    "  voice providers",
    "  voice say --text TEXT [--provider P] [--voice V] [--output PATH]",
    "  voice transcribe --audio PATH [--provider P]",
    "  voice runs [--kind tts|stt] [--provider P]",
  ].join("\n") + "\n");
  process.exit(0);
}
async function main() {
  if (group === "serve") {
    const { app } = buildVoiceApp({ config: { ...(flags.port ? { port: Number(flags.port) } : {}), ...(flags.secret ? { sharedSecret: flags.secret } : {}) } });
    const addr = await app.listen({ host: flags.host ?? "127.0.0.1", port: flags.port ? Number(flags.port) : 4690 });
    process.stdout.write(`${addr}\n`); return;
  }
  const baseUrl = flags.url ?? "http://127.0.0.1:4690"; const token = flags.token ?? flags.secret ?? "";
  const client = new VoiceApiClient({ baseUrl, token });
  if (group === "providers") { write(await client.providers()); return; }
  if (group === "say") { write(await client.say({ text: flags.text, provider: flags.provider as "system-tts" | "elevenlabs" | "openai-tts" | "azure-speech" | undefined, voice: flags.voice ?? null, outputPath: flags.output ?? null })); return; }
  if (group === "transcribe") { write(await client.transcribe({ audioPath: flags.audio, provider: flags.provider as "whisper-local" | "whisper-cloud" | "deepgram" | "openai-stt" | "azure-stt" | undefined })); return; }
  if (group === "runs") { write(await client.runs({ kind: flags.kind as "tts" | "stt" | undefined, provider: flags.provider, limit: flags.limit ? Number(flags.limit) : undefined })); return; }
  process.stderr.write(`Unknown command: ${group}\n`); process.exit(64);
}
try { await main(); process.exit(0); } catch (e) { process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); }
