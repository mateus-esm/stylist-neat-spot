import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

// Clerk Frontend API proxy — must be BEFORE express.json()
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

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

// Clerk auth — use callback form so we can derive the proxy URL per-request
app.use(
  clerkMiddleware((req: Request) => {
    const protocol =
      (req.headers["x-forwarded-proto"] as string | undefined) || "https";
    const host = getClerkProxyHost(req) || "";
    if (!host) {
      return {};
    }
    return { proxyUrl: `${protocol}://${host}${CLERK_PROXY_PATH}` };
  }),
);

app.use("/api", router);

export default app;
