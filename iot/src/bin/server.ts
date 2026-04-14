import { buildIotApp } from "../server/app.ts";

const { app } = buildIotApp();
const host = process.env.IOT_HOST ?? "127.0.0.1";
const port = Number(process.env.IOT_PORT ?? "4520");

const address = await app.listen({ host, port });
process.stdout.write(`${address}\n`);
