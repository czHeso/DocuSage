import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
    // Several modules import server/db.ts at the top level, which refuses to
    // load without a connection string. The `pg` pool is lazy – it opens no
    // socket until a query runs – so a dummy URL is enough and no test in this
    // suite touches a database.
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:59999/test",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
