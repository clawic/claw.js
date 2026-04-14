import { buildVaultApp } from "../server/app.ts";

const { app } = buildVaultApp();

app.listen({ host: process.env.VAULT_HOST ?? "127.0.0.1", port: Number(process.env.VAULT_PORT ?? 4610) })
  .then(() => {
    console.log(`[vault] listening on ${process.env.VAULT_HOST ?? "127.0.0.1"}:${process.env.VAULT_PORT ?? 4610}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
