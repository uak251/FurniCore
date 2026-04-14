import "./load-env";
import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocket } from "./lib/socket";
import { loadSessionPolicy } from "./lib/sessionPolicy.js";
import { envConfig } from "../config/env.js";

await loadSessionPolicy();

const port = envConfig.port;
const httpServer = createServer(app);
initSocket(httpServer);
httpServer.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
        logger.error(
            { port, err },
            `Port ${port} is already in use. Stop the other process or set PORT to a free port.`,
        );
    }
    else {
        logger.error({ err }, "http_server_error");
    }
    process.exit(1);
});
httpServer.listen(port, () => {
    logger.info({ port }, "Server listening");
});
