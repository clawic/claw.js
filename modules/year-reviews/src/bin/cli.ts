import { YearReviewsClient, loadYearReviewsConfig } from "@clawjs/year-reviews";

async function main(): Promise<void> {
  const config = loadYearReviewsConfig();
  const client = new YearReviewsClient({
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
  process.stderr.write(`year-reviews cli error: ${(error as Error).message}\n`);
  process.exit(1);
});
