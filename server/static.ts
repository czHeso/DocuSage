/**
 * Logging and static file serving for production.
 *
 * This module deliberately imports nothing from Vite. `server/vite.ts` pulls in
 * `vite` and `@vitejs/plugin-react`, which are devDependencies – a production
 * install (`npm ci --omit=dev`) does not have them. ESM imports are hoisted, so
 * a single static import of that module anywhere in the bundle makes Node refuse
 * to load the server before the first line of code runs, even though the dev-only
 * function is never called. Everything the production path needs therefore lives
 * here, and `./vite` is reached only through a dynamic import in development.
 */
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
