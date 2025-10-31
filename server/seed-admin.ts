import bcrypt from "bcryptjs";
import { storage } from "./storage";

async function seedAdmin() {
  const adminEmail = "admin@example.com";
  const adminPassword = "admin123";

  try {
    const existing = await storage.getAdminByEmail(adminEmail);
    if (existing) {
      console.log("Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await storage.createAdmin({
      email: adminEmail,
      password: hashedPassword,
      name: "Admin User",
    });

    console.log("Admin created successfully!");
    console.log("Email:", adminEmail);
    console.log("Password:", adminPassword);
  } catch (error) {
    console.error("Error creating admin:", error);
  }
}

seedAdmin();
