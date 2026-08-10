/**
 * Database connection.
 *
 * Two drivers are supported and the right one is picked from `DATABASE_URL`:
 *
 *   - `@neondatabase/serverless` – for Neon. Talks over a WebSocket, which is what
 *     makes it work on serverless platforms that have no long-lived TCP sockets.
 *   - `pg` – for every other PostgreSQL: a local instance, Docker, Azure Database
 *     for PostgreSQL, Cloud SQL, or your own server.
 *
 * The Neon driver cannot talk to a plain PostgreSQL server (it would try to open a
 * WebSocket against a host that does not speak it), so the choice is not cosmetic.
 * Set `DATABASE_DRIVER=neon` or `DATABASE_DRIVER=postgres` to override the detection.
 */
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import pg from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from "ws";
import * as schema from "@shared/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Copy .env.example to .env and fill in the connection string.",
  );
}

/** True for Neon connection strings, which need the WebSocket driver. */
function isNeonUrl(url: string): boolean {
  try {
    return /(^|\.)neon\.tech$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

const override = process.env.DATABASE_DRIVER?.toLowerCase();
const useNeon =
  override === "neon" || (override !== "postgres" && isNeonUrl(connectionString));

/**
 * The connection pool. Both drivers expose the `pg` interface, so the session store
 * (connect-pg-simple) accepts either one.
 */
export const pool = useNeon
  ? (() => {
      neonConfig.webSocketConstructor = ws;
      return new NeonPool({ connectionString });
    })()
  : new pg.Pool({ connectionString });

export const db = useNeon
  ? drizzleNeon({ client: pool as NeonPool, schema })
  : drizzlePg({ client: pool as pg.Pool, schema });

console.log(`[db] Connected using the ${useNeon ? "Neon serverless" : "PostgreSQL (pg)"} driver.`);
