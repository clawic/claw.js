import { buildMentorshipApp } from "@clawjs/mentorship";

const { app, config } = buildMentorshipApp();

const port = config.port;
const host = config.host;

app
  .listen({ port, host })
  .then(() => {
    process.stdout.write(`mentorship service listening on http://${host}:${port}\n`);
  })
  .catch((error) => {
    process.stderr.write(`mentorship service failed to start: ${(error as Error).message}\n`);
    process.exit(1);
  });
