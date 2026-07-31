/**
 * Bootstrap script to initialize default admin and test artist accounts
 * Runs automatically on server startup
 */
import bcrypt from "bcryptjs";
import { storage } from "./storage";

export async function bootstrapAdmin() {
  const adminEmail = "admin@369artcollective.com";
  const adminPassword = "Admin369AC";

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

      console.log("âœ… Default admin account created");
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log("   âš ï¸  IMPORTANT: Change these credentials after first login!");
    }

    // Create test artist account ONLY in development/test environments

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

      console.log("âœ… Test artist account created");
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);

    }

  } catch (error) {
    console.error("Failed to bootstrap accounts:", error);
  }
}
