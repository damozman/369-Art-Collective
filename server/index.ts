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
    secure: true, // Replit uses HTTPS for all environments
    httpOnly: true,
    sameSite: "none", // CRITICAL: 'none' required for cross-origin cookie transmission with credentials
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

// Debug: Log incoming cookies to diagnose session cookie transmission
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log('[DEBUG][COOKIES] Request to', req.path, {
      cookieHeader: req.headers.cookie,
      parsedCookies: req.cookies,
      sessionID: req.sessionID,
      hasSessionUser: !!req.session?.user
    });
  }
  next();
});

// Affiliate tracking middleware - captures ?ref= parameter and sets cookies
app.use(affiliateTrackingMiddleware);

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
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
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

    res.status(status).json({ message });
    throw err;
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
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
