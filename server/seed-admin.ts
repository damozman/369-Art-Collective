/**
 * Seed script to create the first admin account
 * Uses the ADMIN_BOOTSTRAP_SECRET to authenticate the request
 */

const ADMIN_BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET;

async function createAdmin() {
  const baseUrl = `http://localhost:${process.env.PORT || 5000}`;

  const adminData = {
    email: "admin@example.com",
    name: "Admin User",
    password: "admin123",
  };

  console.log("Creating admin account...");
  console.log(`Email: ${adminData.email}`);
  console.log(`Password: ${adminData.password}`);
  console.log("\n⚠️  IMPORTANT: Change these credentials after first login!\n");

  if (!ADMIN_BOOTSTRAP_SECRET) {
    console.error("❌ Error: ADMIN_BOOTSTRAP_SECRET environment variable not set");
    console.error("Please set the ADMIN_BOOTSTRAP_SECRET in your Replit Secrets");
    process.exit(1);
  }

  try {
    const response = await fetch(`${baseUrl}/api/admins/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bootstrap-secret": ADMIN_BOOTSTRAP_SECRET,
      },
      body: JSON.stringify(adminData),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("❌ Failed to create admin:", error.message);
      process.exit(1);
    }

    const result = await response.json();
    console.log("✅ Admin account created successfully!");
    console.log("Admin ID:", result.id);
    console.log("\nYou can now log in at /login using the Admin tab.");
  } catch (error: any) {
    console.error("❌ Error creating admin:", error.message);
    console.error("\nMake sure the application is running first:");
    console.error("  npm run dev");
    process.exit(1);
  }
}

createAdmin();
