import { buildVoiceApp } from "@clawjs/voice";
const { app, config } = buildVoiceApp();
await app.listen({ host: config.host, port: config.port });
process.stdout.write(`voice listening on http://${config.host}:${config.port}\n`);
