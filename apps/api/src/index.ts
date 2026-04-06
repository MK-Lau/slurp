import "./firebase"; // init Firebase Admin before any routes
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { logger } from "./logger";
import { errorHandler } from "./middleware/errorHandler";
import { globalLimiter } from "./middleware/rateLimiter";
import slurpsRouter from "./routes/slurps";
import receiptRouter from "./routes/receipt";
import usersRouter from "./routes/users";

const app = express();
const port = parseInt(process.env.PORT ?? "8080", 10);

app.use(helmet());

// Cloud Run sits behind Google's load balancer; trust the first proxy so
// express-rate-limit uses X-Forwarded-For (real client IP) not the proxy IP.
app.set("trust proxy", 1);

const rawOrigins = process.env.ALLOWED_ORIGINS ?? "http://localhost:3000";
if (rawOrigins.trim() === "") {
  logger.error("ALLOWED_ORIGINS is set but empty — refusing to start with broken CORS config");
  process.exit(1);
}
app.use(
  cors({
    origin: rawOrigins.split(","),
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(globalLimiter);
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, "request");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/slurps", slurpsRouter);
app.use("/slurps/:id/receipt", receiptRouter);
app.use("/profile", usersRouter);
app.use(errorHandler);

app.listen(port, () => {
  logger.info({ port }, "slurp-api listening");
});
