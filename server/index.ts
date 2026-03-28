import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

// ── Trust proxy (required when behind nginx/load balancer) ───────────────────
// Without this, secure cookies fail and req.ip returns the proxy IP.
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

// ── Security headers ────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

// ── Session ───────────────────────────────────────────────────────────────────
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === "production") {
    console.error("[security] FATAL: SESSION_SECRET is not set. Refusing to start in production without it.");
    process.exit(1);
  } else {
    console.warn("[security] SESSION_SECRET is not set — using insecure fallback. Set this in production.");
  }
}

const PgSession = connectPgSimple(session);
const sessionPool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      createTableIfMissing: true,
    }),
    secret: sessionSecret || "fallback-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // secure: false — Express runs behind nginx inside Docker; the
      // nginx↔browser leg is HTTPS (nginx enforces it), the nginx↔container
      // leg is always private HTTP. Setting secure:true here causes Express to
      // suppress Set-Cookie entirely for any non-TLS request, which silently
      // breaks login whenever X-Forwarded-Proto isn't forwarded correctly.
      // Rely on nginx + firewall to protect the cookie in transit.
      secure: false,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === "production";

// Broad /api rate limit — blunt protection against scrapers / abuse
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  skip: () => !isProd,
});
app.use("/api", globalApiLimiter);

// Tight limits on high-sensitivity auth actions
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                    // 10 attempts per 15 min (down from 20)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again in 15 minutes." },
  skip: () => !isProd,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour window for registration
  max: 5,                     // 5 accounts per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many accounts created from this IP, please try again later." },
  skip: () => !isProd,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,                     // 5 reset emails per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset requests, please try again in an hour." },
  skip: () => !isProd,
});

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 3,                     // 3 resends per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification emails sent, please wait before trying again." },
  skip: () => !isProd,
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/forgot-password", forgotPasswordLimiter);
app.use("/api/auth/resend-verification", resendVerificationLimiter);
app.use("/api/auth/resend-verification-public", resendVerificationLimiter);

// ── Request logger ────────────────────────────────────────────────────────────
const SENSITIVE_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/admin/users",
]);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !SENSITIVE_PATHS.has(path)) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // ── Global error handler ────────────────────────────────────────────────────
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    console.error("Server error:", err);

    if (res.headersSent) {
      return next(err);
    }

    const message =
      process.env.NODE_ENV === "production" && status === 500
        ? "Internal Server Error"
        : err.message || "Internal Server Error";

    return res.status(status).json({ error: message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
