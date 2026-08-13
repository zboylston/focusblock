import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { ensureTasksTable } from "@workspace/db";
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

app.use("/api", async (req, _res, next) => {
  if (req.originalUrl.split("?")[0] === "/api/healthz") {
    next();
    return;
  }
  try {
    await ensureTasksTable();
    next();
  } catch (err) {
    next(err);
  }
});

app.use("/api", router);

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  const cause = err instanceof Error ? err.cause : undefined;
  logger.error({ err, cause }, "unhandled error");
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "Internal Server Error" });
});

export default app;
