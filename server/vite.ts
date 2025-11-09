// server/vite.ts
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";

// REMOVED: import { createServer as createViteServer, createLogger } from "vite";
// REMOVED: import viteConfig from "../vite.config";
// REMOVED: import { nanoid } from "nanoid";

// REMOVED: const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// REMOVED ENTIRE setupVite FUNCTION — IT CAUSES CRASH
// export async function setupVite(...) { ... }

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist"); // Fixed path
  if (!fs.existsSync(distPath)) {
    log(
      `Build directory not found: ${distPath}. Run 'npm run build' first.`,
      "vite",
    );
    // Don't throw — allow API to work
  } else {
    app.use(express.static(distPath));
    app.use("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
    log(`Serving static files from: ${distPath}`, "vite");
  }
}
