import { defineConfig } from "drizzle-kit";

/**
 * Separate migration lineage for the engine schema.
 *
 * The engine and the marketplace are deliberately unlinked (ratified decision
 * #9), and giving them one config makes drizzle-kit diff the two against each
 * other — it offers to "rename" marketplace tables into engine tables, which is
 * both wrong and destructive. Separate configs keep the histories independent,
 * which is also what lets the marketplace tables be dropped wholesale in Phase 2
 * without disturbing the engine.
 */
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations/engine",
  schema: "./shared/engine-schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  tablesFilter: ["engine_*"],
});
