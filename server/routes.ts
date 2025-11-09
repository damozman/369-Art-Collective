import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import {
  insertArtistSchema,
  insertAdminSchema,
  insertArtworkSchema,
  updateArtworkSchema,
  loginSchema,
  changePasswordSchema,
  updateArtistProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateAdminProfileSchema,
  deleteAccountSchema,
} from "@shared/schema";
import crypto from "crypto";
import { createDraftProduct, createArtworkProduct, isShopifyConfigured } from "./lib/shopify";
import { createWallArtProducts } from "./lib/printify-service";
import { isPrintifyConfigured } from "./lib/printify";
import { requireAuth, requireArtist, requireAdmin } from "./middleware/auth";
import { processShopifyOrder } from "./lib/order-processor";
import { verifyShopifyWebhook } from "./lib/shopify-webhook-security";

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-").toLowerCase();
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Rate limiters for security-critical endpoints
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many password reset requests. Please try again later.",
    });
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many login attempts. Please try again later.",
    });
  },
});

// Helper function to convert relative image URLs to absolute URLs
function toAbsoluteUrl(imageUrl: string, req?: Request): string {
  // Guard against null/undefined
  if (!imageUrl) {
    return imageUrl;
  }
  
  // If already absolute, return as-is
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  // Get base URL from REPLIT_DOMAINS or request host
  const replitDomain = process.env.REPLIT_DOMAINS 
    ? process.env.REPLIT_DOMAINS.split(',').map(d => d.trim()).find(d => !d.includes('-')) || process.env.REPLIT_DOMAINS.split(',')[0].trim()
    : null;
  
  const baseUrl = replitDomain
    ? `https://${replitDomain}`
    : req 
      ? `${req.protocol}://${req.get('host')}`
      : `http://localhost:${process.env.PORT || 5000}`;
  
  // Ensure imageUrl starts with /
  const cleanPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  return `${baseUrl}${cleanPath}`;
}

// Helper to normalize artwork object with absolute image URL
function normalizeArtwork(artwork: any, req?: Request): any {
  return {
    ...artwork,
    imageUrl: toAbsoluteUrl(artwork.imageUrl, req),
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Shopify webhook endpoint - SECURED with HMAC verification
  // Raw body is captured by global express.json verify function in index.ts
  app.post("/api/webhooks/shopify/orders", async (req: any, res) => {
    try {
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const shop = req.headers['x-shopify-shop-domain'];
      
      console.log(`Received Shopify webhook from ${shop}`);

      // CRITICAL: Verify HMAC signature using raw body captured in middleware
      if (!req.rawBody) {
        console.error("❌ Raw body not available for HMAC verification");
        return res.status(500).send('Server configuration error');
      }

      if (!verifyShopifyWebhook(req.rawBody, hmac)) {
        console.warn("⚠️ HMAC verification failed - rejecting webhook");
        return res.status(401).send('Unauthorized');
      }

      console.log("✅ Webhook HMAC verified");

      // Body is already parsed by express.json middleware
      const shopifyOrder = req.body;
      
      // Process order asynchronously (don't block webhook response)
      processShopifyOrder(shopifyOrder).catch(error => {
        console.error("Order processing failed:", error);
      });

      // Respond immediately to Shopify (must respond within 5 seconds)
      res.status(200).send('OK');
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  }, (req, res, next) => {
    const filePath = path.join(uploadDir, req.path);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Get current user session
  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json(req.user);
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // ===== ARTIST ROUTES =====

  // Register new artist
  app.post("/api/artists/register", async (req, res) => {
    try {
      const data = insertArtistSchema.parse(req.body);

      const existing = await storage.getArtistByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const artist = await storage.createArtist({
        ...data,
        password: hashedPassword,
      });

      // Regenerate session and automatically log in the new artist
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Registration failed" });
        }

        // Set session
        req.session.user = {
          id: artist.id,
          email: artist.email,
          name: artist.name,
          type: "artist",
          approved: artist.approved,
        };

        const { password, ...artistData } = artist;
        res.status(201).json(artistData);
      });
    } catch (error: any) {
      console.error("Artist registration error:", error);
      res.status(400).json({ message: error.message || "Registration failed" });
    }
  });

  // Artist login (with rate limiting)
  app.post("/api/artists/login", loginLimiter, async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const artist = await storage.getArtistByEmail(email);
      if (!artist) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, artist.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Login failed" });
        }

        // Set session
        req.session.user = {
          id: artist.id,
          email: artist.email,
          name: artist.name,
          type: "artist",
          approved: artist.approved,
        };

        const { password: _, ...artistData } = artist;
        res.json(artistData);
      });
    } catch (error: any) {
      console.error("Artist login error:", error);
      res.status(400).json({ message: error.message || "Login failed" });
    }
  });

  // Get all artists (admin only)
  app.get("/api/artists", requireAdmin, async (_req, res) => {
    try {
      const artists = await storage.getAllArtists();
      const sanitized = artists.map(({ password, ...artist }) => artist);
      res.json(sanitized);
    } catch (error: any) {
      console.error("Get artists error:", error);
      res.status(500).json({ message: "Failed to fetch artists" });
    }
  });

  // Approve artist (admin only)
  app.post("/api/artists/:id/approve", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const artist = await storage.updateArtist(id, { approved: true });
      const { password, ...artistData } = artist;
      res.json(artistData);
    } catch (error: any) {
      console.error("Approve artist error:", error);
      res.status(500).json({ message: "Failed to approve artist" });
    }
  });

  // Delete artist (admin only)
  app.post("/api/admin/artists/:id/delete", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const artist = await storage.getArtist(id);
      
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Soft delete the artist account
      await storage.deleteArtist(id);

      res.json({ message: "Artist account deleted successfully" });
    } catch (error: any) {
      console.error("Delete artist error:", error);
      res.status(500).json({ message: "Failed to delete artist" });
    }
  });

  // Get single artist details (admin only)
  app.get("/api/artists/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const artist = await storage.getArtist(id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }
      const { password, ...artistData } = artist;
      res.json(artistData);
    } catch (error: any) {
      console.error("Get artist error:", error);
      res.status(500).json({ message: "Failed to fetch artist" });
    }
  });

  // Update artist profile (artist updates their own)
  app.patch("/api/artists/profile", requireArtist, async (req, res) => {
    try {
      const data = updateArtistProfileSchema.parse(req.body);
      const artist = req.user!;

      // Check if email is being changed and if it's already taken
      if (data.email && data.email !== artist.email) {
        const existing = await storage.getArtistByEmail(data.email);
        if (existing) {
          return res.status(400).json({ message: "Email already in use" });
        }
      }

      const updatedArtist = await storage.updateArtist(artist.id, data);
      
      // Update session if email or name changed
      if (data.email || data.name) {
        req.session.user = {
          ...req.session.user!,
          email: updatedArtist.email,
          name: updatedArtist.name,
        };
      }

      const { password, ...artistData } = updatedArtist;
      res.json(artistData);
    } catch (error: any) {
      console.error("Update profile error:", error);
      res.status(400).json({ message: error.message || "Failed to update profile" });
    }
  });

  // Change password (artist changes their own)
  app.post("/api/artists/change-password", requireArtist, async (req, res) => {
    try {
      const data = changePasswordSchema.parse(req.body);
      const artist = req.user!;

      // Get full artist record with password
      const fullArtist = await storage.getArtist(artist.id);
      if (!fullArtist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Verify current password
      const validPassword = await bcrypt.compare(data.currentPassword, fullArtist.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(data.newPassword, 10);
      await storage.updateArtist(artist.id, { password: hashedPassword });

      res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      console.error("Change password error:", error);
      res.status(400).json({ message: error.message || "Failed to change password" });
    }
  });

  // Delete account (artist deletes their own account)
  app.post("/api/artists/delete-account", requireArtist, async (req, res) => {
    try {
      const data = deleteAccountSchema.parse(req.body);
      const artist = req.user!;

      // Get full artist record with password
      const fullArtist = await storage.getArtist(artist.id);
      if (!fullArtist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Verify password
      const validPassword = await bcrypt.compare(data.password, fullArtist.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Incorrect password" });
      }

      // Soft delete the artist account
      await storage.deleteArtist(artist.id);

      // Destroy session and log out
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
          return res.status(500).json({ message: "Account deleted but logout failed" });
        }
        res.json({ message: "Account deleted successfully" });
      });
    } catch (error: any) {
      console.error("Delete account error:", error);
      res.status(400).json({ message: error.message || "Failed to delete account" });
    }
  });

  // Admin reset artist password (generates temporary password)
  app.post("/api/artists/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const artist = await storage.getArtist(id);
      
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Generate temporary password
      const tempPassword = `temp${Math.random().toString(36).slice(2, 10)}`;
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      await storage.updateArtist(id, { password: hashedPassword });

      res.json({ 
        message: "Password reset successfully",
        temporaryPassword: tempPassword,
        artistEmail: artist.email,
      });
    } catch (error: any) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ===== PASSWORD RESET ROUTES (SECURE SELF-SERVICE) =====

  // Helper: Generate secure token
  function generateSecureToken(): string {
    return crypto.randomBytes(64).toString('base64url');
  }

  // Helper: Hash token for storage
  function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Forgot password - Artist (with rate limiting)
  app.post("/api/auth/forgot-password/artist", passwordResetLimiter, async (req, res) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      
      // Always return same response to prevent email enumeration
      const response = { message: "If an account exists, a password reset link has been generated" };
      
      const artist = await storage.getArtistByEmail(email);
      if (!artist) {
        return res.json(response);
      }

      // Invalidate any existing tokens for this user
      await storage.invalidateUserTokens(email, 'artist');

      // Generate secure token
      const plainToken = generateSecureToken();
      const hashedToken = hashToken(plainToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

      await storage.createPasswordResetToken(email, hashedToken, 'artist', expiresAt);

      // SECURITY: Log audit trail without exposing token
      console.log(`[SECURITY] Password reset requested for artist: ${email.substring(0, 3)}***@${email.split('@')[1]}`);
      
      // TODO: Integrate email service to send reset link to user's email
      // For now, admins must manually distribute reset links via secure channel
      // The reset link should be: /reset-password?token=${plainToken}&type=artist

      res.json(response);
    } catch (error: any) {
      console.error("Forgot password error:", error);
      res.status(400).json({ message: error.message || "Failed to process request" });
    }
  });

  // Forgot password - Admin (with rate limiting)
  app.post("/api/auth/forgot-password/admin", passwordResetLimiter, async (req, res) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      
      const response = { message: "If an account exists, a password reset link has been generated" };
      
      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.json(response);
      }

      await storage.invalidateUserTokens(email, 'admin');

      const plainToken = generateSecureToken();
      const hashedToken = hashToken(plainToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await storage.createPasswordResetToken(email, hashedToken, 'admin', expiresAt);

      // SECURITY: Log audit trail without exposing token
      console.log(`[SECURITY] Password reset requested for admin: ${email.substring(0, 3)}***@${email.split('@')[1]}`);
      
      // TODO: Integrate email service to send reset link to user's email
      // For now, admins must manually distribute reset links via secure channel
      // The reset link should be: /reset-password?token=${plainToken}&type=admin

      res.json(response);
    } catch (error: any) {
      console.error("Forgot password error:", error);
      res.status(400).json({ message: error.message || "Failed to process request" });
    }
  });

  // Reset password - Universal (artist or admin) with rate limiting
  app.post("/api/auth/reset-password", passwordResetLimiter, async (req, res) => {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(req.body);
      
      const hashedToken = hashToken(token);
      const resetToken = await storage.getPasswordResetToken(hashedToken);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      if (resetToken.isUsed) {
        return res.status(400).json({ message: "This reset token has already been used" });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password based on user type
      if (resetToken.userType === 'artist') {
        const artist = await storage.getArtistByEmail(resetToken.email);
        if (!artist) {
          return res.status(404).json({ message: "User not found" });
        }
        await storage.updateArtist(artist.id, { password: hashedPassword });
      } else {
        const admin = await storage.getAdminByEmail(resetToken.email);
        if (!admin) {
          return res.status(404).json({ message: "User not found" });
        }
        await storage.updateAdmin(admin.id, { password: hashedPassword });
      }

      // Mark token as used
      await storage.markTokenAsUsed(hashedToken);

      res.json({ message: "Password reset successful" });
    } catch (error: any) {
      console.error("Reset password error:", error);
      res.status(400).json({ message: error.message || "Failed to reset password" });
    }
  });

  // ===== STRIPE CONNECT ROUTES =====

  // Generate Stripe Connect account link for artist
  app.get("/api/stripe/connect-url", requireArtist, async (req, res) => {
    try {
      const { stripeConnectService } = await import("./lib/stripe-connect");
      const sessionUser = req.user!;
      
      // Get full artist record to access stripeAccountId
      const artist = await storage.getArtist(sessionUser.id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const refreshUrl = `${baseUrl}/artist/payouts?refresh=true`;
      const returnUrl = `${baseUrl}/artist/payouts?success=true`;

      // Check if artist already has a connected account
      let accountId = artist.stripeAccountId;
      
      if (!accountId) {
        // Try to find existing account by artist ID
        accountId = await stripeConnectService.getAccountByArtistId(artist.id);
      }

      if (accountId) {
        // Get account status
        const accountStatus = await stripeConnectService.getAccountStatus(accountId);
        
        // Update artist record with account ID and status
        await storage.updateArtist(artist.id, {
          stripeAccountId: accountId,
          stripeAccountStatus: accountStatus.payouts_enabled ? 'active' : 'pending',
        });

        // If account is already active, return status
        if (accountStatus.payouts_enabled) {
          return res.json({
            accountId,
            status: 'active',
            message: 'Stripe account already connected'
          });
        }
      }

      // Create account link for onboarding (pass existing accountId if available)
      const { url, accountId: newAccountId } = await stripeConnectService.createAccountLink({
        artistId: artist.id,
        artistEmail: artist.email,
        stripeAccountId: accountId || undefined,
        refreshUrl,
        returnUrl,
      });

      // Save the account ID to artist record if it was just created
      if (!accountId && newAccountId) {
        await storage.updateArtist(artist.id, {
          stripeAccountId: newAccountId,
          stripeAccountStatus: 'pending',
        });
      } else if (accountId) {
        // Update existing artist with pending status
        await storage.updateArtist(artist.id, {
          stripeAccountStatus: 'pending',
        });
      }

      res.json({ url });
    } catch (error: any) {
      console.error("Stripe Connect URL error:", error);
      res.status(500).json({ message: error.message || "Failed to generate connect URL" });
    }
  });

  // Handle Stripe Connect OAuth callback (called automatically by Stripe)
  app.get("/api/stripe/connect-callback", async (req, res) => {
    try {
      const { stripeConnectService } = await import("./lib/stripe-connect");
      const { code } = req.query;

      if (!code) {
        return res.status(400).json({ message: "Missing authorization code" });
      }

      // Note: In production, you would exchange the code for account ID
      // For now, we're using Express accounts which don't require OAuth code exchange
      res.redirect("/artist/payouts?success=true");
    } catch (error: any) {
      console.error("Stripe Connect callback error:", error);
      res.redirect("/artist/payouts?error=true");
    }
  });

  // Get artist's Stripe account status
  app.get("/api/stripe/account-status", requireArtist, async (req, res) => {
    try {
      const sessionUser = req.user!;
      
      // Get full artist record to access stripeAccountId
      const artist = await storage.getArtist(sessionUser.id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }
      
      if (!artist.stripeAccountId) {
        return res.json({ connected: false });
      }

      const { stripeConnectService } = await import("./lib/stripe-connect");
      const accountStatus = await stripeConnectService.getAccountStatus(artist.stripeAccountId);

      // Update artist record with latest status
      await storage.updateArtist(artist.id, {
        stripeAccountStatus: accountStatus.payouts_enabled ? 'active' : 'pending',
      });

      res.json({
        connected: true,
        accountId: artist.stripeAccountId,
        payoutsEnabled: accountStatus.payouts_enabled,
        chargesEnabled: accountStatus.charges_enabled,
        detailsSubmitted: accountStatus.details_submitted,
        status: accountStatus.payouts_enabled ? 'active' : 'pending',
      });
    } catch (error: any) {
      console.error("Account status error:", error);
      res.status(500).json({ message: "Failed to get account status" });
    }
  });

  // Get artist payout history
  app.get("/api/artists/:id/payouts", requireArtist, async (req, res) => {
    try {
      const { id } = req.params;
      const artist = req.user!;

      // Artists can only view their own payouts
      if (artist.id !== id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const payouts = await storage.getPayoutsByArtist(id);
      res.json(payouts);
    } catch (error: any) {
      console.error("Get payouts error:", error);
      res.status(500).json({ message: "Failed to fetch payouts" });
    }
  });

  // ===== ADMIN ROUTES =====

  // Admin profile update
  app.patch("/api/admins/profile", requireAdmin, async (req, res) => {
    try {
      const data = updateAdminProfileSchema.parse(req.body);
      const admin = req.user!;

      // Check if email is being changed and if it's already taken
      if (data.email && data.email !== admin.email) {
        const existing = await storage.getAdminByEmail(data.email);
        if (existing) {
          return res.status(400).json({ message: "Email already in use" });
        }
      }

      const updatedAdmin = await storage.updateAdmin(admin.id, data);
      
      // Update session if email or name changed
      if (data.email || data.name) {
        req.session.user = {
          ...req.session.user!,
          email: updatedAdmin.email,
          name: updatedAdmin.name,
        };
      }

      const { password, ...adminData } = updatedAdmin;
      res.json(adminData);
    } catch (error: any) {
      console.error("Update admin profile error:", error);
      res.status(400).json({ message: error.message || "Failed to update profile" });
    }
  });

  // Admin change password
  app.post("/api/admins/change-password", requireAdmin, async (req, res) => {
    try {
      const data = changePasswordSchema.parse(req.body);
      const admin = req.user!;

      // Get full admin record with password
      const fullAdmin = await storage.getAdmin(admin.id);
      if (!fullAdmin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      // Verify current password
      const validPassword = await bcrypt.compare(data.currentPassword, fullAdmin.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(data.newPassword, 10);
      await storage.updateAdmin(admin.id, { password: hashedPassword });

      res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      console.error("Admin change password error:", error);
      res.status(400).json({ message: error.message || "Failed to change password" });
    }
  });

  // Admin login (with rate limiting)
  app.post("/api/admins/login", loginLimiter, async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, admin.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Login failed" });
        }

        // Set session
        req.session.user = {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          type: "admin",
        };

        console.log("Admin logged in - session created:", {
          sessionID: req.sessionID,
          userType: req.session.user.type,
          userId: req.session.user.id,
        });

        const { password: _, ...adminData } = admin;
        res.json(adminData);
      });
    } catch (error: any) {
      console.error("Admin login error:", error);
      res.status(400).json({ message: error.message || "Login failed" });
    }
  });

  // Create admin (protected by bootstrap secret or requires existing admin)
  app.post("/api/admins/create", async (req, res) => {
    try {
      // Check if admin creation is allowed
      const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
      const providedSecret = req.headers["x-bootstrap-secret"];
      
      // Option 1: Check if bootstrap secret provided and matches
      if (bootstrapSecret && providedSecret !== bootstrapSecret) {
        return res.status(403).json({ message: "Invalid bootstrap secret" });
      }
      
      // Option 2: If no bootstrap secret set, require existing admin to create new admin
      if (!bootstrapSecret) {
        if (!req.session?.user || req.session.user.type !== "admin") {
          return res.status(403).json({ message: "Admin access required to create new admins" });
        }
      }

      const data = insertAdminSchema.parse(req.body);

      const existing = await storage.getAdminByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const admin = await storage.createAdmin({
        ...data,
        password: hashedPassword,
      });

      const { password, ...adminData } = admin;
      res.status(201).json(adminData);
    } catch (error: any) {
      console.error("Admin creation error:", error);
      res.status(400).json({ message: error.message || "Admin creation failed" });
    }
  });

  // ===== ARTWORK ROUTES =====

  // Upload file (requires artist auth)
  app.post("/api/upload", requireArtist, upload.single("file"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const imageUrl = `/uploads/${req.file.filename}`;
      res.status(201).json({ imageUrl });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  });

  // Create artwork (requires artist auth)
  app.post("/api/artworks", requireArtist, async (req, res) => {
    try {
      // Use authenticated user's ID, not request data
      const data = insertArtworkSchema.parse({
        ...req.body,
        artistId: req.user!.id,
      });
      const artwork = await storage.createArtwork(data);
      res.status(201).json(normalizeArtwork(artwork, req));
    } catch (error: any) {
      console.error("Create artwork error:", error);
      res.status(400).json({ message: error.message || "Failed to create artwork" });
    }
  });

  // Get artworks for current artist (requires artist auth)
  app.get("/api/artworks/my-artworks", requireArtist, async (req, res) => {
    try {
      // Use authenticated user's ID from session
      const artworks = await storage.getArtworksByArtist(req.user!.id);
      res.json(artworks.map(a => normalizeArtwork(a, req)));
    } catch (error: any) {
      console.error("Get my artworks error:", error);
      res.status(500).json({ message: "Failed to fetch artworks" });
    }
  });

  // Get all artworks (admin only)
  app.get("/api/artworks/all", requireAdmin, async (req, res) => {
    try {
      const artworks = await storage.getAllArtworks();
      res.json(artworks.map(a => normalizeArtwork(a, req)));
    } catch (error: any) {
      console.error("Get all artworks error:", error);
      res.status(500).json({ message: "Failed to fetch artworks" });
    }
  });

  // Update artwork (artist can only update their own)
  app.patch("/api/artworks/:id", requireArtist, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify artwork belongs to authenticated artist
      const artwork = await storage.getArtwork(id);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }
      
      if (artwork.artistId !== req.user!.id) {
        return res.status(403).json({ message: "Not authorized to update this artwork" });
      }

      const updates = updateArtworkSchema.parse(req.body);
      const updated = await storage.updateArtwork(id, updates);
      res.json(normalizeArtwork(updated, req));
    } catch (error: any) {
      console.error("Update artwork error:", error);
      res.status(400).json({ message: error.message || "Failed to update artwork" });
    }
  });

  // Approve artwork and create Printify + Shopify products (admin only)
  app.post("/api/artworks/:id/approve", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const artwork = await storage.getArtwork(id);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }

      // Get artist information
      const artist = await storage.getArtist(artwork.artistId);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Build absolute image URL for Shopify/Printify
      // REPLIT_DOMAINS format: "247portal-hash.replit.app,247portal.replit.app"
      const replitDomain = process.env.REPLIT_DOMAINS 
        ? process.env.REPLIT_DOMAINS.split(',').map(d => d.trim()).find(d => !d.includes('-')) || process.env.REPLIT_DOMAINS.split(',')[0].trim()
        : null;
      
      const baseUrl = replitDomain
        ? `https://${replitDomain}`
        : `http://localhost:${process.env.PORT || 5000}`;
      
      const imageUrl = artwork.imageUrl.startsWith("http") 
        ? artwork.imageUrl 
        : `${baseUrl}${artwork.imageUrl}`;
      
      console.log(`[Artwork Approval] Constructed image URL: ${imageUrl}`);

      let printifyProductId = null;
      let printifyImageId = null;
      let shopifyProductId = null;

      // Step 1: Create Printify product (PRIORITY - this is the fulfillment source)
      if (isPrintifyConfigured()) {
        try {
          console.log("Creating Printify product for artwork:", id);
          const printifyResult = await createWallArtProducts(
            imageUrl,
            artwork.title,
            artwork.description || undefined
          );

          printifyProductId = printifyResult.printifyProductId;
          printifyImageId = printifyResult.printifyImageId;
          
          console.log("Printify product created:", printifyProductId);
        } catch (error: any) {
          console.error("Printify product creation failed:", error);
          // Continue approval process even if Printify fails
          // Admin can manually retry or use different image
        }
      }

      // Step 2: Create Shopify product (for storefront)
      if (isShopifyConfigured()) {
        try {
          const shopifyProduct = await createArtworkProduct({
            title: artwork.title,
            description: artwork.description || undefined,
            artistName: artist.name,
            artistShort: artist.artistShort,
            artworkId: id,
            imageUrl,
            tags: artwork.tags || [],
          });

          shopifyProductId = shopifyProduct.product.id.toString();
          console.log("Shopify product created:", shopifyProductId);
        } catch (error: any) {
          console.error("Shopify product creation failed:", error);
          // Continue even if Shopify fails - Printify is the critical part
        }
      }

      const updated = await storage.updateArtwork(id, {
        status: "approved",
        shopifyProductId,
        printifyProductId,
        printifyImageId,
      });

      res.json(normalizeArtwork(updated, req));
    } catch (error: any) {
      console.error("Approve artwork error:", error);
      res.status(500).json({ message: error.message || "Failed to approve artwork" });
    }
  });

  // Reject artwork (admin only)
  app.post("/api/artworks/:id/reject", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const updated = await storage.updateArtwork(id, {
        status: "rejected",
        rejectionReason: reason || "No reason provided",
      });

      res.json(normalizeArtwork(updated, req));
    } catch (error: any) {
      console.error("Reject artwork error:", error);
      res.status(500).json({ message: error.message || "Failed to reject artwork" });
    }
  });

  // Get artist earnings stats
  app.get("/api/artists/:id/earnings", requireArtist, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify artist can only access their own earnings
      if (req.session.user?.id !== id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const artist = await storage.getArtist(id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Get all sales for this artist
      const sales = await storage.getSalesByArtist(id);

      // Calculate total earnings
      const totalEarnings = sales.reduce((sum, sale) => {
        return sum + parseFloat(sale.totalEarnings || '0');
      }, 0);

      // Get monthly sales amount for tier calculation
      const monthlySales = parseFloat(artist.monthlySales || '0');

      // Determine current tier
      const { getRoyaltyTierPercentage } = await import("./lib/royalty-calculator");
      const currentTier = getRoyaltyTierPercentage(monthlySales);

      // Determine next tier threshold
      let nextTierThreshold = 0;
      let nextTierPercentage = 0;
      if (monthlySales < 1000) {
        nextTierThreshold = 1000;
        nextTierPercentage = 35;
      } else if (monthlySales < 5000) {
        nextTierThreshold = 5000;
        nextTierPercentage = 40;
      } else if (monthlySales < 10000) {
        nextTierThreshold = 10000;
        nextTierPercentage = 45;
      } else {
        nextTierThreshold = 10000;
        nextTierPercentage = 45; // Max tier
      }

      // Get sales with artwork details
      const salesWithArtwork = await Promise.all(
        sales.map(async (sale) => {
          const artwork = await storage.getArtwork(sale.artworkId);
          return {
            ...sale,
            artworkTitle: artwork?.title || 'Unknown Artwork',
          };
        })
      );

      res.json({
        totalEarnings: totalEarnings.toFixed(2),
        monthlySales: monthlySales.toFixed(2),
        currentTier,
        nextTierThreshold,
        nextTierPercentage,
        salesCount: sales.length,
        sales: salesWithArtwork.slice(0, 20), // Recent 20 sales
      });
    } catch (error: any) {
      console.error("Get earnings error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch earnings" });
    }
  });

  // Get artist referral stats
  app.get("/api/artists/:id/referrals", requireArtist, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify artist can only access their own referrals
      if (req.session.user?.id !== id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const artist = await storage.getArtist(id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Get all sales for this artist (includes recruitment bonuses)
      const sales = await storage.getSalesByArtist(id);
      
      // Calculate referral-driven sales (sales where artist drove traffic)
      const referralSales = sales.filter(sale => parseFloat(sale.referralBonus || '0') > 0);
      const totalReferralEarnings = referralSales.reduce((sum, sale) => {
        return sum + parseFloat(sale.referralBonus || '0');
      }, 0);
      
      // Calculate recruitment bonuses (sales where this artist recruited someone)
      const recruitmentSales = sales.filter(sale => parseFloat(sale.recruitmentBonus || '0') > 0);
      const totalRecruitmentEarnings = recruitmentSales.reduce((sum, sale) => {
        return sum + parseFloat(sale.recruitmentBonus || '0');
      }, 0);

      // Get list of artists recruited by this artist
      const allArtists = await storage.getAllArtists();
      const recruitedArtists = allArtists.filter(a => a.referredBy === id);

      // Build referral stats for each recruited artist
      const recruitedArtistStats = await Promise.all(
        recruitedArtists.map(async (recruited) => {
          const recruitedSales = await storage.getSalesByArtist(recruited.id);
          const totalSales = recruitedSales.length;
          const totalEarnings = recruitedSales.reduce((sum, sale) => {
            return sum + parseFloat(sale.totalEarnings || '0');
          }, 0);
          
          return {
            id: recruited.id,
            name: recruited.name,
            email: recruited.email,
            joinedAt: recruited.createdAt,
            totalSales,
            totalEarnings,
          };
        })
      );

      // Generate referral link
      const shopifyUrl = process.env.SHOPIFY_SHOP_URL || 'your-store.myshopify.com';
      const referralLink = `https://${shopifyUrl}?utm_source=${artist.referralCode}&utm_medium=referral&utm_campaign=artist_network`;

      res.json({
        referralCode: artist.referralCode,
        referralLink,
        stats: {
          totalReferralSales: referralSales.length,
          totalReferralEarnings,
          totalArtistsRecruited: recruitedArtists.length,
          totalRecruitmentEarnings,
        },
        recruitedArtists: recruitedArtistStats,
      });
    } catch (error: any) {
      console.error("Get referrals error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch referrals" });
    }
  });

  // Admin Empire Dashboard - Network growth & revenue analytics
  app.get("/api/admin/empire", requireAdmin, async (req, res) => {
    try {
      // Get all artists and sales
      const allArtists = await storage.getAllArtists();
      const allOrders = await storage.getAllOrders();

      // Calculate total revenue from all sales
      let totalRevenue = 0;
      let totalReferralBonuses = 0;
      let totalRecruitmentBonuses = 0;

      // Build artist earnings map
      const artistEarningsMap = new Map<string, {
        totalEarnings: number;
        salesCount: number;
        monthlySales: number;
        referralEarnings: number;
        recruitmentEarnings: number;
        recruitedCount: number;
      }>();

      // Initialize map for all artists
      allArtists.forEach(artist => {
        artistEarningsMap.set(artist.id, {
          totalEarnings: 0,
          salesCount: 0,
          monthlySales: parseFloat(artist.monthlySales || '0'),
          referralEarnings: 0,
          recruitmentEarnings: 0,
          recruitedCount: 0,
        });
      });

      // Process all orders to calculate sales and bonuses
      for (const order of allOrders) {
        if (order.artistId) {
          const sales = await storage.getSalesByArtist(order.artistId);
          const orderSales = sales.filter(s => s.orderId === order.id);
          
          for (const sale of orderSales) {
            const earnings = parseFloat(sale.totalEarnings || '0');
            const referralBonus = parseFloat(sale.referralBonus || '0');
            const recruitmentBonus = parseFloat(sale.recruitmentBonus || '0');

            totalRevenue += earnings;
            totalReferralBonuses += referralBonus;
            totalRecruitmentBonuses += recruitmentBonus;

            // Update artist's earnings
            const artistStats = artistEarningsMap.get(sale.artistId);
            if (artistStats) {
              artistStats.totalEarnings += earnings;
              artistStats.salesCount += 1;
              artistStats.referralEarnings += referralBonus;
            }

            // Track recruitment earnings for recruiter
            if (order.referralArtistId && order.referralArtistId !== sale.artistId) {
              const recruiterStats = artistEarningsMap.get(order.referralArtistId);
              if (recruiterStats) {
                recruiterStats.recruitmentEarnings += recruitmentBonus;
              }
            }
          }
        }
      }

      // Count recruited artists per recruiter
      allArtists.forEach(artist => {
        if (artist.referredBy) {
          const recruiterStats = artistEarningsMap.get(artist.referredBy);
          if (recruiterStats) {
            recruiterStats.recruitedCount += 1;
          }
        }
      });

      // Build top artists list
      const topArtists = Array.from(artistEarningsMap.entries())
        .map(([id, stats]) => {
          const artist = allArtists.find(a => a.id === id);
          if (!artist) return null;

          // Calculate tier based on monthly sales
          let currentTier = 'Bronze';
          if (stats.monthlySales >= 10000) currentTier = 'Platinum';
          else if (stats.monthlySales >= 5000) currentTier = 'Gold';
          else if (stats.monthlySales >= 1000) currentTier = 'Silver';

          return {
            id,
            name: artist.name,
            email: artist.email,
            totalEarnings: stats.totalEarnings,
            salesCount: stats.salesCount,
            currentTier,
          };
        })
        .filter(a => a !== null && a.totalEarnings > 0)
        .sort((a, b) => (b?.totalEarnings || 0) - (a?.totalEarnings || 0))
        .slice(0, 10);

      // Build top recruiters list
      const topRecruiters = Array.from(artistEarningsMap.entries())
        .map(([id, stats]) => {
          const artist = allArtists.find(a => a.id === id);
          if (!artist) return null;

          return {
            id,
            name: artist.name,
            email: artist.email,
            recruitedCount: stats.recruitedCount,
            recruitmentEarnings: stats.recruitmentEarnings,
          };
        })
        .filter(a => a !== null && a.recruitedCount > 0)
        .sort((a, b) => (b?.recruitedCount || 0) - (a?.recruitedCount || 0))
        .slice(0, 10);

      const totalRecruitedArtists = allArtists.filter(a => a.referredBy).length;

      res.json({
        totalRevenue,
        totalReferralBonuses,
        totalRecruitmentBonuses,
        totalArtists: allArtists.length,
        totalRecruitedArtists,
        topArtists,
        topRecruiters,
      });
    } catch (error: any) {
      console.error("Get empire stats error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch empire stats" });
    }
  });

  // Admin: Process monthly payouts for all artists
  app.post("/api/admin/process-payouts", requireAdmin, async (req, res) => {
    try {
      const { processPayouts } = await import("./lib/payout-processor");
      
      const result = await processPayouts();

      res.json({
        message: "Payouts processed successfully",
        ...result,
      });
    } catch (error: any) {
      console.error("Process payouts error:", error);
      res.status(500).json({ message: error.message || "Failed to process payouts" });
    }
  });

  // Admin: Get all payouts
  app.get("/api/admin/payouts", requireAdmin, async (_req, res) => {
    try {
      const payouts = await storage.getAllPayouts();
      res.json(payouts);
    } catch (error: any) {
      console.error("Get all payouts error:", error);
      res.status(500).json({ message: "Failed to fetch payouts" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
