/**
 * Drizzle database client using Neon serverless driver with connection pooling
 * Connection pooling improves performance for high-traffic applications
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const pool = new Pool({
  connectionString: databaseUrl,
});

// Create Drizzle client with schema
export const db = drizzle(pool, { schema });

export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl);
}
