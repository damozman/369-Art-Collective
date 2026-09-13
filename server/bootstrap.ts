/**
 * Seeds the initial admin account on server startup.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE USED TO DO, AND WHY IT WAS DANGEROUS
 * ────────────────────────────────────────────────────────────────────────
 *
 * 1. **It carried a hardcoded admin password in tracked source**, so the
 *    credential for the highest-privilege account in the system was readable by
 *    anyone with repository access, forever, including in every old commit.
 *
 * 2. **It printed that password to stdout on every cold start** — in production
 *    as well as locally. Anywhere logs are visible is then admin access.
 *
 * 3. **It also created a TEST ARTIST with the same password.** The comment said
 *    "ONLY in development/test environments" but nothing enforced it, so a
 *    production deployment got a second known-password sign-in nobody knew about.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOW
 * ────────────────────────────────────────────────────────────────────────
 *
 * Production requires `BOOTSTRAP_ADMIN_PASSWORD` and creates NOTHING without it.
 * Refusing is the right failure: an unseeded deployment is an inconvenience you
 * notice immediately, while a deployment seeded with a published password is a
 * breach you may never notice.
 *
 * Local development keeps its existing convenience account, unchanged, because
 * the risk it carries is confined to a machine the developer already controls.
 *
 * ⚠️ The password is never logged in any environment. Not even in development —
 * the habit is what matters, and a developer who can read this file does not
 * need it echoed.
 */
import bcrypt from "bcryptjs";
import { storage } from "./storage";

const DEV_DEFAULT_PASSWORD = "Admin369AC";

export async function bootstrapAdmin() {
  const isProduction = process.env.NODE_ENV === "production";
  const adminEmail =
    process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@369artcollective.com";

  const adminPassword =
    process.env.BOOTSTRAP_ADMIN_PASSWORD ??
    (isProduction ? null : DEV_DEFAULT_PASSWORD);

  if (!adminPassword) {
    console.warn(
      "⚠️  Skipping admin bootstrap: set BOOTSTRAP_ADMIN_PASSWORD to seed an " +
        "initial admin in production. No account has been created."
    );
    return;
  }

  try {
    const existingAdmin = await storage.getAdminByEmail(adminEmail);
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await storage.createAdmin({
        email: adminEmail,
        password: hashedPassword,
        name: "Admin User",
      });

      // The address is logged so an operator knows which account exists.
      // The password is not, and must never be.
      console.log(`✅ Admin account created for ${adminEmail}`);
      console.log("   ⚠️  Change this password after first sign-in.");
    }

    // ⚠️ DEVELOPMENT ONLY, AND NOW ACTUALLY ENFORCED. This creates a second
    // sign-in sharing the admin password; in production that is a known-password
    // artist account nobody asked for.
    if (isProduction) return;

    const existingArtist = await storage.getArtistByEmail(adminEmail);
    if (!existingArtist) {
      const artistHashedPassword = await bcrypt.hash(adminPassword, 10);
      await storage.createArtist({
        email: adminEmail,
        password: artistHashedPassword,
        name: "Test Artist",
        artistShort: "TEST",
        bio: "Test artist account for development and testing",
        approved: true, // Pre-approve test artist for immediate access
      });

      console.log(`✅ Development test artist created for ${adminEmail}`);

      const newArtist = await storage.getArtistByEmail(adminEmail);
      if (newArtist) {
        await storage.getOrCreateAiCredits(newArtist.id, "artist");
        console.log("✓ AI Credits: 10 free credits available for new test artist");
      }
    }
  } catch (error) {
    console.error("Failed to bootstrap accounts:", error);
  }
}
