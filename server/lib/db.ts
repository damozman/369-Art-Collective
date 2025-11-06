/**
 * Drizzle database client using Neon serverless driver
 * Direct database access bypassing Supabase schema cache
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

// Create Neon HTTP client
const sql = neon(databaseUrl);

// Create Drizzle client with schema
export const db = drizzle(sql, { schema });

export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl);
}
