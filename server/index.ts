import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./vite-utils";
import { affiliateTrackingMiddleware } from "./middleware/affiliate-tracking";

const app = express();
const PgSession = connectPgSimple(session);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Trust proxy - REQUIRED for Replit deployments behind reverse proxy
// This allows Express to recognize HTTPS connections and set secure cookies properly
app.set('trust proxy', 1);

// CORS middleware - CRITICAL for cookie transmission in Replit environment
// Allow credentials (cookies) to be sent with cross-origin requests
app.use(cors({
  origin: true, // Allow requests from any origin (Replit uses dynamic proxy domains)
  credentials: true, // REQUIRED for cookies to work with fetch credentials: 'include'
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Session middleware with PostgreSQL store
// Replit serves all apps over HTTPS, so we always use secure cookies
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session', // Will auto-create if it doesn't exist
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production", // true in prod (HTTPS), false on localhost
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // lax works on localhost; none required for cross-origin prod
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
  proxy: true, // Trust proxy headers (needed for Replit deployments)
}));

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// NOTE: a debug middleware used to log `req.headers.cookie`, `req.cookies` and
// `req.sessionID` for every /api/ request. A session cookie is a bearer
// credential: anyone holding it *is* that user until it expires. Writing one to
// stdout means log access — a hosting dashboard, a shipped log drain, a support
// screenshare — is account takeover, with no password involved. Session
// identifiers are never loggable. If cookie transmission needs diagnosing again,
// log presence (`!!req.headers.cookie`), never the value.

// Affiliate tracking middleware - captures ?ref= parameter and sets cookies
app.use(affiliateTrackingMiddleware);

// Request logging: method, path, status and duration only.
//
// This used to append the serialised JSON response body, truncated to 79
// characters. Truncation is not redaction — it caps how much leaks, not what.
// Several responses carry credentials in their first few characters: the Stripe
// Connect onboarding link (`{"url":"https://connect.stripe.com/setup/e/..."}`)
// is single-use and grants access to a contributor's payout onboarding, and any
// future token-bearing response would be captured the same way. A body is never
// worth logging by default; when a specific endpoint needs tracing, log inside
// that handler through `secureLog`, which redacts known-sensitive fields.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // Bootstrap default admin account
  const { bootstrapAdmin } = await import("./bootstrap");
  await bootstrapAdmin();

  // The engine mounts as its own router, deliberately not merged into the
  // marketplace's registerRoutes. When the marketplace is retired in Phase 2,
  // this line and the engine directory are what survive.
  const { createEngineRouter } = await import("./engine/routes");
  const { getEngineDb, isEngineDbConfigured } = await import("./engine/db");
  if (isEngineDbConfigured()) {
    const engineDb = getEngineDb();
    app.use("/api/engine", createEngineRouter(engineDb));
    const { createAdminRouter } = await import("./engine/admin-routes");
    app.use("/api/engine", createAdminRouter(engineDb));

    // Inbound Shopify deliveries. Mounted outside the tenant-scoped routers
    // because Shopify posts every store to one URL and identifies the store in
    // a header — the tenant is resolved from that, not from the path.
    const { createShopifyWebhookRouter } = await import("./engine/adapters/shopify/routes");
    app.use("/api/engine", createShopifyWebhookRouter(engineDb));
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[ERROR] ${status} ${message}`, err.stack || err);
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = Number(process.env.PORT || 5000);

  // Using the standard arguments to satisfy TypeScript and Windows networking
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();