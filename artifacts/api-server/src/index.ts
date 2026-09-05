import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT ?? "3000"}`);
}

const server = createServer(app);

server.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "API server listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "API server shutting down");
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "API server shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

export default app;
