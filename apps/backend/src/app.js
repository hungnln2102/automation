const express = require("express");
const path = require("path");
const cors = require("cors");
const morgan = require("morgan");
const session = require("express-session");
const helmet = require("helmet");
const {
  allowedOrigins,
  allowedOriginSet,
  normalizeOrigin,
  session: sessionConfig,
} = require("./config/appConfig");
const { redisClient, isRedisAvailable } = require("./config/redisClient");
const v1Routes = require("./routes/v1");
const { AUTH_OPEN_PATHS } = require("./middleware/authGuard");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimiter");
const {
  generateToken,
  verifyToken,
  addTokenToResponse,
} = require("./middleware/csrfProtection");
const logger = require("./utils/logger");

const app = express();
app.set("trust proxy", 1);
/** API JSON: tắt ETag mặc định của Express để tránh 304 + body rỗng khi client gửi If-None-Match (admin luôn nhận 200 + payload). */
app.set("etag", false);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", ...allowedOrigins],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOriginSet.has(normalizeOrigin(origin))) {
        return callback(null, true);
      }
      return callback(new Error(`Blocked by CORS: ${origin}`));
    },
    credentials: true,
  })
);

if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined", { stream: logger.stream }));
} else {
  app.use(morgan("dev", { stream: logger.stream }));
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
const staticOpts = { maxAge: "30d", etag: true };
app.use("/image", express.static(path.join(__dirname, "../image"), staticOpts));
app.use(
  "/image_product",
  express.static(path.join(__dirname, "../image_product"), staticOpts)
);
app.use(
  "/image_variant",
  express.static(path.join(__dirname, "../image_variant"), staticOpts)
);

const { pool: dbPool } = require("./config/database");

app.get("/api/health", async (_req, res) => {
  const uptime = process.uptime();
  const redisOk = isRedisAvailable();
  try {
    await dbPool.query("SELECT 1");
    return res.json({ status: "ok", uptime, dbConnected: true, redisConnected: redisOk });
  } catch {
    return res.status(503).json({ status: "degraded", uptime, dbConnected: false, redisConnected: redisOk });
  }
});

const sessionOpts = {
  name: sessionConfig.name,
  secret: sessionConfig.secret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: sessionConfig.cookieSameSite,
    secure: sessionConfig.cookieSecure,
    maxAge: 1000 * 60 * 60 * 1,
  },
};

if (isRedisAvailable()) {
  try {
    const RedisStore = require("connect-redis").default;
    sessionOpts.store = new RedisStore({ client: redisClient, prefix: "sess:" });
    logger.info("[Session] Using Redis store");
  } catch {
    logger.warn("[Session] connect-redis not installed — using in-memory store");
  }
} else {
  logger.info("[Session] Using in-memory store (no Redis)");
}

app.use(session(sessionOpts));

app.use("/api", generateToken);
app.use("/api", addTokenToResponse);
app.use("/api", verifyToken);

app.get("/api", (_req, res) => {
  res.json({
    ok: true,
    authOpen: Array.from(AUTH_OPEN_PATHS),
    csrfEnabled:
      !(process.env.DISABLE_CSRF === "true" || process.env.DISABLE_CSRF === "1"),
  });
});

app.use("/api", apiLimiter);
app.use("/api/v1", v1Routes);
app.use("/api", v1Routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
