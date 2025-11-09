/**
 * Bootstrap script to initialize default admin account
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
      return;
    }

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
  } catch (error) {
    console.error("Failed to create default admin:", error);
  }
}
