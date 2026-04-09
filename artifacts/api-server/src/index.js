import "./load-env";
import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocket } from "./lib/socket";
import { loadSessionPolicy } from "./lib/sessionPolicy.js";

await loadSessionPolicy().catch((err) => {
    logger.error({ err }, "sessionPolicy_load_failed");
});

const rawPort = process.env["PORT"];
if (!rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
}
const httpServer = createServer(app);
initSocket(httpServer);
httpServer.listen(port, (err) => {
    if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
    }
    logger.info({ port }, "Server listening");
});
