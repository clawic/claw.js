import { YesNoClient, loadYesNoConfig } from "@clawjs/yes-no";

async function main(): Promise<void> {
  const config = loadYesNoConfig();
  const client = new YesNoClient({
    baseUrl: `http://${config.host}:${config.port}`,
    token: config.sharedSecret,
  });
  const subcommand = process.argv[2];
  switch (subcommand) {
    case "catalog": {
      const items = await client.catalog();
      process.stdout.write(JSON.stringify(items, null, 2) + "\n");
      return;
    }
    case "observations": {
      const items = await client.listObservations();
      process.stdout.write(JSON.stringify(items, null, 2) + "\n");
      return;
    }
    case "health":
    default: {
      const health = await client.health();
      process.stdout.write(JSON.stringify(health, null, 2) + "\n");
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`yes-no cli error: ${(error as Error).message}\n`);
  process.exit(1);
});
