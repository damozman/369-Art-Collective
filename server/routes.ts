import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import {
  insertArtistSchema,
  insertAdminSchema,
  insertArtworkSchema,
  updateArtworkSchema,
  loginSchema,
} from "@shared/schema";
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

  // Artist login
  app.post("/api/artists/login", async (req, res) => {
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

  // ===== ADMIN ROUTES =====

  // Admin login
  app.post("/api/admins/login", async (req, res) => {
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
      res.status(201).json(artwork);
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
      res.json(artworks);
    } catch (error: any) {
      console.error("Get my artworks error:", error);
      res.status(500).json({ message: "Failed to fetch artworks" });
    }
  });

  // Get all artworks (admin only)
  app.get("/api/artworks/all", requireAdmin, async (_req, res) => {
    try {
      const artworks = await storage.getAllArtworks();
      res.json(artworks);
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
      res.json(updated);
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

      // Build absolute image URL
      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : `http://localhost:${process.env.PORT || 5000}`;
      
      const imageUrl = artwork.imageUrl.startsWith("http") 
        ? artwork.imageUrl 
        : `${baseUrl}${artwork.imageUrl}`;

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

      res.json(updated);
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

      res.json(updated);
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

  const httpServer = createServer(app);
  return httpServer;
}
