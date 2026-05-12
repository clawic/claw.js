import { buildSkillsPracticeApp } from "@clawjs/skills-practice";

const { app, config } = buildSkillsPracticeApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`skills-practice service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`skills-practice service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
