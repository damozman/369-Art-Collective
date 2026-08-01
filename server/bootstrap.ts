/**
 * Bootstrap script to initialize default admin and test artist accounts
 * Runs automatically on server startup
 *
 * Two rules govern this file, both learned the hard way:
 *
 * 1. **The default password is never printed and never hardcoded for
 *    production.** This file used to embed a literal password and echo it to
 *    stdout on every cold start. That put a working admin credential for every
 *    deployment into the repository *and* into the logs — two independent
 *    copies of the same key, neither revocable. The development default is kept
 *    (local flows depend on it, and it only ever unlocks a throwaway database),
 *    but production requires `BOOTSTRAP_ADMIN_PASSWORD` to be set explicitly:
 *    without it, no account is created at all.
 *
 * 2. **The test artist is development-only, and now actually is.** The comment
 *    claiming that was already here; the guard was not. Production deployments
 *    were being seeded with a second sign-in — sharing the admin's address and
 *    password — that nothing in the product surfaces and nobody would think to
 *    audit.
 */
import bcrypt from "bcryptjs";
import { storage } from "./storage";

const DEV_DEFAULT_PASSWORD = "Admin369AC";

export async function bootstrapAdmin() {
  const isProduction = process.env.NODE_ENV === "production";
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@369artcollective.com";
  const adminPassword =
    process.env.BOOTSTRAP_ADMIN_PASSWORD ?? (isProduction ? null : DEV_DEFAULT_PASSWORD);

  if (!adminPassword) {
    // Production with nothing configured: seeding a known-password admin is far
    // worse than having no admin, because the first is silently exploitable and
    // the second is merely inconvenient and immediately obvious.
    console.warn(
      "⚠️  Skipping admin bootstrap: set BOOTSTRAP_ADMIN_PASSWORD to seed an initial admin in production.",
    );
    return;
  }

  try {
    const existingAdmin = await storage.getAdminByEmail(adminEmail);
    if (!existingAdmin) {
      // Create default admin
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await storage.createAdmin({
        email: adminEmail,
        password: hashedPassword,
        name: "Admin User",
      });

      console.log("✅ Default admin account created");
      console.log(`   Email: ${adminEmail}`);
      console.log("   Password: (as configured; change it after first login)");
    }

    // Create test artist account ONLY in development/test environments
    if (isProduction) {
      return;
    }

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

      console.log("✅ Test artist account created (development only)");
      console.log(`   Email: ${adminEmail}`);
    }
  } catch (error) {
    console.error("Failed to bootstrap accounts:", error);
  }
}
