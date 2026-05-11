import { buildMCPApp } from "@clawjs/mcp";

const { app, config } = buildMCPApp();
await app.listen({ host: config.host, port: config.port });
process.stdout.write(`mcp listening on http://${config.host}:${config.port}\n`);
