/**
 * Vite dev server middleware. Development only.
 *
 * `vite` and the config it imports are devDependencies, so this module must
 * never be reachable from a static import chain in the production bundle – see
 * the note in `server/static.ts`. It is loaded with a dynamic `import()` guarded
 * by the environment check in `server/index.ts`, and the build marks `./vite` as
 * external so esbuild leaves that import as a runtime lookup instead of inlining
 * the module (which would hoist `import ... from "vite"` into the bundle again).
 */
import { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger, type ServerOptions } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(app: Express, server: Server) {
  // Without `allowedHosts: true`, Vite keeps its default Host header check,
  // which protects the dev server against DNS rebinding. If you need to
  // reach the dev server through a custom domain or tunnel, list the
  // specific hostnames in VITE_ALLOWED_HOSTS (comma-separated).
  const allowedHosts = process.env.VITE_ALLOWED_HOSTS
    ? process.env.VITE_ALLOWED_HOSTS.split(",").map((host) => host.trim())
    : undefined;

  const serverOptions: ServerOptions = {
    middlewareMode: true,
    hmr: { server },
    ...(allowedHosts ? { allowedHosts } : {}),
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
