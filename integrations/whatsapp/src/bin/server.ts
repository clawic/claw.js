import { buildWhatsappApp } from "../server/app.ts";

const { app, config } = buildWhatsappApp();
await app.listen({ host: config.host, port: config.port || 4705 });
process.stdout.write(`whatsapp listening on http://${config.host}:${config.port || 4705}\n`);
