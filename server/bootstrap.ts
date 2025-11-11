/**
 * Bootstrap script to initialize default admin and test artist accounts
 * Runs automatically on server startup
 */
import bcrypt from "bcryptjs";
import { storage } from "./storage";

export async function bootstrapAdmin() {
  const adminEmail = "admin@example.com";
  const adminPassword = "admin123";

  try {
    // Check if admin already exists
    const existing = await storage.getAdminByEmail(adminEmail);
    if (existing) {
      console.log("✓ Default admin account already exists");
    } else {
      // Create default admin
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await storage.createAdmin({
        email: adminEmail,
        password: hashedPassword,
        name: "Admin User",
      });

      console.log("✅ Default admin account created");
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log("   ⚠️  IMPORTANT: Change these credentials after first login!");
    }

    // Create test artist account ONLY in development/test environments
    // SECURITY: Never create test accounts with known credentials in production
    if (process.env.NODE_ENV !== "production") {
      const testArtistEmail = "artist@example.com";
      const testArtistPassword = "artist123";
      
      let artist = await storage.getArtistByEmail(testArtistEmail);
      if (!artist) {
        const artistHashedPassword = await bcrypt.hash(testArtistPassword, 10);
        artist = await storage.createArtist({
          email: testArtistEmail,
          password: artistHashedPassword,
          name: "Test Artist",
          artistShort: "TEST",
          bio: "Test artist account for development and testing",
          website: "https://example.com",
          socialMedia: {},
          ipDeclarationAccepted: true,
          termsAccepted: true,
          approved: true, // Pre-approve test artist for immediate access
        });

        console.log("✅ Test artist account created (dev/test only)");
        console.log(`   Email: ${testArtistEmail}`);
        console.log(`   Password: ${testArtistPassword}`);
      } else {
        // Ensure existing test artist is approved
        if (!artist.approved) {
          await storage.updateArtist(artist.id, { approved: true });
          console.log("✓ Test artist account updated to approved status");
        } else {
          console.log("✓ Test artist account already exists and is approved");
        }
      }

      // Initialize AI credits for test artist if not already done
      await storage.getOrCreateAiCredits(artist.id, 'artist');
      console.log("✓ AI Credits: 10 free credits available");
    }
  } catch (error) {
    console.error("Failed to bootstrap accounts:", error);
  }
}
