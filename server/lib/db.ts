/**
 * Drizzle database client using Neon serverless driver with connection pooling
 * Connection pooling improves performance for high-traffic applications
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

// Enable connection pooling for production deployments
// Neon's pooler is automatically used when DATABASE_URL contains the pooler endpoint
const sql = neon(databaseUrl, {
  fullResults: true,
  fetchOptions: {
    cache: 'no-store',
  },
});

// Create Drizzle client with schema
export const db = drizzle(sql, { schema });

export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl);
}
