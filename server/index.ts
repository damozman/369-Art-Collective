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

// A debug middleware here used to log `req.headers.cookie`, `req.cookies` and
// `req.sessionID` on every /api/ request, to diagnose session transmission.
//
// ⚠️ NEVER REINSTATE IT. A session cookie is a bearer credential: whoever holds
// it *is* that user until it expires, with no password involved. Writing one to
// stdout turns anywhere logs are visible — a hosting dashboard, a shipped log
// drain, a support screenshare — into account takeover.
//
// If cookie transmission ever needs diagnosing again, log PRESENCE and never the
// value: `console.log('[cookies]', req.path, { hasCookie: !!req.headers.cookie })`.

// Affiliate tracking middleware - captures ?ref= parameter and sets cookies
app.use(affiliateTrackingMiddleware);

// Request logging: method, path, status and duration. Nothing else.
//
// ⚠️ THE RESPONSE BODY IS NEVER LOGGED. This used to append the serialised JSON
// response, truncated to 79 characters — but truncation caps how MUCH leaks, not
// WHAT. Several responses carry credentials in their opening characters: the
// Stripe Connect onboarding link (`{"url":"https://connect.stripe.com/setup/e/..."}`)
// is single-use and grants access to an artist's payout onboarding, and any
// future token-bearing response would be captured the same way.
//
// When one endpoint genuinely needs tracing, trace inside that handler through
// `server/lib/secure-logger.ts`, which redacts known-sensitive fields.
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