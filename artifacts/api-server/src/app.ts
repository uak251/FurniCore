import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

/**
 * Global JSON error handler — registered LAST so it catches every unhandled
 * throw from any route. Without this, Express returns an HTML error page
 * which causes the frontend's res.json() to throw a parse error, swallowing
 * the real server message and showing "Something went wrong" instead.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);

  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status: unknown }).status)
      : 500;

  const message =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : "An unexpected server error occurred. Please try again.";

  res
    .status(status >= 100 && status < 600 ? status : 500)
    .json({ error: "SERVER_ERROR", message });
});

export default app;
