import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { log } from "./vite";

const app = express();

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
    proxy: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// Logging middleware
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

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  console.error("ERROR:", err);
});

(async () => {
  // Bootstrap default admin
  const { bootstrapAdmin } = await import("./bootstrap");
  await bootstrapAdmin();

  // Register API routes
  const server = await registerRoutes(app);

  // PRODUCTION: Serve static client from dist/client
  if (process.env.NODE_ENV === "production") {
    const clientPath = path.join(__dirname, "../../dist/client");

    app.use(express.static(clientPath));

    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) return;
      res.sendFile(path.join(clientPath, "index.html"));
    });

    log("PRODUCTION MODE: Serving static client from dist/client");
  }

  // DEVELOPMENT: Let Vite handle frontend (via setupVite)
  if (process.env.NODE_ENV !== "production") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  }

  // Start server
  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`247 PRINT NETWORK LIVE on port ${port}`);
      log(`Visit: https://247portal.replit.app`);
    }
  );
})();