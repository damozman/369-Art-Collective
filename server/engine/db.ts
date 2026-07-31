/**
 * The engine's database client.
 *
 * Separate from `server/lib/db.ts` because the two schemas are deliberately
 * unlinked (ratified decision #9). Same connection string, same Postgres — a
 * different Drizzle instance bound to the engine tables, so neither side's
 * queries can reach the other's tables through the ORM.
 *
 * Lazily constructed so importing engine modules does not open a connection at
 * import time. That is what keeps the money logic testable in environments with
 * no database.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "./ingest";

let pool: Pool | null = null;
let db: EngineDb | null = null;

export function getEngineDb(): EngineDb {
  if (db) return db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  pool = new Pool({ connectionString });
  db = drizzle(pool, { schema }) as unknown as EngineDb;
  return db;
}

export function isEngineDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
