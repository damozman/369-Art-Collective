import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import { storage } from "./storage";
import { ObjectStorageService } from "./objectStorage";
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
  insertViolationReportSchema,
  insertTestimonialSchema,
  insertInfluencerSchema,
  influencerApplicationSchema,
  adminActions,
  artists,
} from "@shared/schema";
import { db } from "./lib/db";
import crypto from "crypto";
import { createDraftProduct, createArtworkProduct, isShopifyConfigured, updateProductStatus } from "./lib/shopify";
import { DpiValidatorService } from "./lib/dpi-validator-service";
import { upscaleUsage } from "@shared/schema";
import { eq, or, desc } from "drizzle-orm";
import { createWallArtProducts } from "./lib/printify-service";
import { isPrintifyConfigured } from "./lib/printify";
import { syncPrintifyMockupsWithRetry } from "./lib/printify-mockup-sync";
import { requireAuth, requireArtist, requireAdmin, requireInfluencer } from "./middleware/auth";
import { getAffiliateCodeFromCookie } from "./middleware/affiliate-tracking";

import { processShopifyOrder } from "./lib/order-processor";
import { getCostResolver } from "./lib/cost-resolver-factory";
import { parseDecimalToMinor } from "./lib/money";
import {
  ROYALTY_TIER_LADDER,
  royaltyPercentForMonthlySales,
} from "@shared/financial-utils";
import { verifyShopifyWebhook } from "./lib/shopify-webhook-security";
import { 
  validateImageQuality, 
  validateImageQualityFromBuffer, 
  validatePortfolioImageQuality,
  getImageDimensions,
  getImageDimensionsFromBuffer,
  MIN_LONG_SIDE, 
  MIN_SHORT_SIDE,
  PORTFOLIO_MIN_LONG_SIDE,
  PORTFOLIO_MIN_SHORT_SIDE
} from "./lib/image-validator";
import { stripeConnectService } from "./lib/stripe-connect";
import { executeArtistPayout, processAllPayouts, calculateArtistPayout } from "./lib/payout-service";
import { emailService } from "./lib/email-service";
import { generateReferralCode } from "./lib/referral-code-generator";
import Stripe from "stripe";


const uploadDir = path.join(process.cwd(), 'uploads'); // legacy dev fallback only

// Catalog cap, applied to every artist. This was a free-tier paywall; with the
// artist subscription product removed it just bounds how much any one artist
// can push into the Printify pipeline.
const ARTWORK_UPLOAD_LIMIT = 20;

// upscale_usage.tier is a historical snapshot column. Tiers no longer exist,
// so new rows record a single flat value.
const UPSCALE_TIER_SNAPSHOT = 'standard';

// Upscale jobs were prioritised by subscription tier; the queue is now FIFO.
const UPSCALE_JOB_PRIORITY = 3;

// Configure multer for file uploads (using memory storage for object storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit to accommodate upscaled images
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Provide specific error message based on file type
      const fileExt = file.originalname.split('.').pop()?.toUpperCase() || 'unknown';
      cb(new Error(`UNSUPPORTED_FORMAT:${fileExt}`));
    }
  },
});

// Separate multer config for portfolio uploads - same 50MB limit as artwork uploads
// Artists need high-res portfolios to demonstrate their work quality
const portfolioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB per file (same as artwork uploads)
    files: 3 // Maximum 3 files
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const fileExt = file.originalname.split('.').pop()?.toUpperCase() || 'unknown';
      cb(new Error(`UNSUPPORTED_FORMAT:${fileExt}`));
    }
  },
});

// Multer error handler middleware - converts technical errors into user-friendly messages
const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err) {
    // File type validation error
    if (err.message && err.message.startsWith('UNSUPPORTED_FORMAT:')) {
      const fileType = err.message.split(':')[1];
      return res.status(400).json({ 
        error: `Only PNG and JPG images are supported. Your ${fileType} file cannot be uploaded. Please convert your image to PNG or JPG format and try again.`,
        errorType: 'UNSUPPORTED_FORMAT',
        fileType
      });
    }
    
    // File size limit error
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'Image file is too large (maximum 50MB allowed). Please compress your image or reduce its resolution and try again.',
        errorType: 'FILE_TOO_LARGE',
        maxSize: '50MB'
      });
    }
    
    // Other multer errors
    if (err.code && err.code.startsWith('LIMIT_')) {
      return res.status(400).json({ 
        error: 'File upload error: ' + err.message,
        errorType: 'UPLOAD_ERROR'
      });
    }
    
    // Generic multer error
    return res.status(400).json({ 
      error: err.message || 'Failed to upload image',
      errorType: 'UPLOAD_ERROR'
    });
  }
  next();
};

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
  max: 100, // 100 login attempts per window (increased for testing)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many login attempts. Please try again later.",
    });
  },
});

// Subscription operation rate limiter (payment operations require strict limits)
const subscriptionMutationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // Max 10 subscription changes per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many subscription requests. Please try again in an hour.",
    });
  },
});

// Subscription read rate limiter (more lenient for fetching data)
const subscriptionReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 reads per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many requests. Please try again later.",
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

  // Get base URL from PUBLIC_APP_URL or request host
  const baseUrl = process.env.PUBLIC_APP_URL
    || (req ? `${req.protocol}://${req.get('host')}` : `http://localhost:${process.env.PORT || 5000}`);
  
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
      
      // CRITICAL: Verify HMAC signature using raw body captured in middleware
      if (!req.rawBody) {
        console.error("âŒ Raw body not available for HMAC verification");
        return res.status(500).send('Server configuration error');
      }

      if (!verifyShopifyWebhook(req.rawBody, hmac)) {
        console.warn("âš ï¸ HMAC verification failed - rejecting webhook");
        return res.status(401).send('Unauthorized');
      }

      console.log("âœ… Webhook HMAC verified");

      // Body is already parsed by express.json middleware
      const shopifyOrder = req.body;

      // Process order asynchronously (don't block webhook response).
      // NOTE: this used to be called twice on every webhook — once above the
      // HMAC log line and once here — racing two royalty calculations for the
      // same order against each other.
      processShopifyOrder(shopifyOrder, getCostResolver(), storage).catch(error => {
        console.error("Order processing failed:", error);
      });

      // Respond immediately to Shopify (must respond within 5 seconds)
      res.status(200).send('OK');
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Health check endpoint - Verify all integrations
  app.get("/api/health", async (_req, res) => {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {} as Record<string, { status: string; message?: string; }>
    };

    let allHealthy = true;

    // Check Database
    try {
      await storage.getAllArtists(); // Simple DB query
      health.services.database = { status: "healthy" };
    } catch (error: any) {
      allHealthy = false;
      health.services.database = { status: "unhealthy", message: error.message };
    }

    // Check Stripe
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        health.services.stripe = { status: "not_configured" };
      } else {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        await stripe.balance.retrieve(); // Simple API call
        health.services.stripe = { status: "healthy" };
      }
    } catch (error: any) {
      allHealthy = false;
      health.services.stripe = { status: "unhealthy", message: error.message };
    }

    // Check Shopify
    try {
      if (!isShopifyConfigured()) {
        health.services.shopify = { status: "not_configured" };
      } else {
        health.services.shopify = { status: "configured" };
      }
    } catch (error: any) {
      health.services.shopify = { status: "error", message: error.message };
    }

    // Check Printify
    try {
      if (!isPrintifyConfigured()) {
        health.services.printify = { status: "not_configured" };
      } else {
        health.services.printify = { status: "configured" };
      }
    } catch (error: any) {
      health.services.printify = { status: "error", message: error.message };
    }

    // Check Gemini
    try {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
        health.services.gemini = { status: "not_configured" };
      } else {
        health.services.gemini = { status: "configured" };
      }
    } catch (error: any) {
      health.services.gemini = { status: "error", message: error.message };
    }

    // Check Email Service (Resend)
    try {
      if (!process.env.RESEND_API_KEY) {
        health.services.email = { status: "not_configured" };
      } else {
        health.services.email = { status: "configured" };
      }
    } catch (error: any) {
      health.services.email = { status: "error", message: error.message };
    }

    // Set overall status
    health.status = allHealthy ? "healthy" : "degraded";

    // Return appropriate status code
    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // Stripe webhook endpoint - SECURED with signature verification
  // Raw body is captured by global express.json verify function in index.ts
  app.post("/api/webhooks/stripe", async (req: any, res) => {
    try {
      const signature = req.headers['stripe-signature'];
      
      // Verify webhook signature using raw body
      if (!req.rawBody) {
        console.error("âŒ Raw body not available for Stripe signature verification");
        return res.status(500).send('Server configuration error');
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error("âŒ STRIPE_WEBHOOK_SECRET not configured");
        return res.status(500).send('Webhook secret not configured');
      }

      let event;
      try {
        event = stripeConnectService.verifyWebhookSignature(
          req.rawBody,
          signature as string,
          webhookSecret
        );
        console.log(`âœ… Stripe webhook verified: ${event.type}`);
      } catch (err: any) {
        console.warn(`âš ï¸ Stripe webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // Handle different event types
      const eventType: string = event.type;
      
      if (eventType === 'account.updated') {
        const account = event.data.object as any;
        const artistId = account.metadata?.artistId;
        
        if (!artistId) {
          console.warn('Account updated webhook received without artistId in metadata');
        } else {
          console.log(`Syncing Stripe account status for artist ${artistId}`);
          
          // Update artist with latest Stripe account status
          await storage.updateArtist(artistId, {
            stripeChargesEnabled: account.charges_enabled || false,
            stripePayoutsEnabled: account.payouts_enabled || false,
            stripeDetailsSubmitted: account.details_submitted || false,
            stripeOnboardingComplete: 
              (account.details_submitted && account.charges_enabled && account.payouts_enabled) || false,
          });
          
          console.log(`âœ… Updated Stripe status for artist ${artistId}`);
        }
      } else if (eventType === 'transfer.created') {
        const transfer = event.data.object as any;
        const payoutId = transfer.metadata?.payoutId;
        
        if (!payoutId) {
          console.warn('Transfer created event received without payoutId in metadata');
        } else {
          console.log(`Transfer created for payout ${payoutId}, transfer ID: ${transfer.id}`);
        }
      } else if (eventType === 'transfer.updated') {
        const transfer = event.data.object as any;
        const payoutId = transfer.metadata?.payoutId;
        
        if (!payoutId) {
          console.warn('Transfer updated event received without payoutId in metadata');
        } else {
          console.log(`Transfer updated for payout ${payoutId}, status: ${transfer.status}`);
          
          // Mark as paid when transfer is complete
          if (transfer.status === 'paid') {
            await storage.updatePayout(payoutId, { status: 'paid' });
            console.log(`âœ… Marked payout ${payoutId} as paid`);
          }
        }
      } else if (eventType === 'transfer.failed') {
        const transfer = event.data.object as any;
        const payoutId = transfer.metadata?.payoutId;
        
        if (!payoutId) {
          console.warn('Transfer failed event received without payoutId in metadata');
        } else {
          console.log(`Transfer failed for payout ${payoutId}`);
          await storage.updatePayout(payoutId, { status: 'failed' });
          console.log(`âœ… Marked payout ${payoutId} as failed`);
        }
      } else if (eventType === 'payout.paid') {
        // Handle Stripe payout completion (different from transfer - this is for platform balance payouts)
        const payout = event.data.object as any;
        const payoutId = payout.metadata?.payoutId;
        
        if (!payoutId) {
          console.warn('Payout paid event received without payoutId in metadata');
        } else {
          console.log(`Payout paid event for payout ${payoutId}`);
          await storage.updatePayout(payoutId, { status: 'paid' });
          console.log(`âœ… Marked payout ${payoutId} as paid (via payout.paid event)`);
        }
      } else if (eventType === 'payout.failed') {
        // Handle Stripe payout failure
        const payout = event.data.object as any;
        const payoutId = payout.metadata?.payoutId;
        
        if (!payoutId) {
          console.warn('Payout failed event received without payoutId in metadata');
        } else {
          console.log(`Payout failed event for payout ${payoutId}`);
          await storage.updatePayout(payoutId, { status: 'failed' });
          console.log(`âœ… Marked payout ${payoutId} as failed (via payout.failed event)`);
        }
      } else {
        console.log(`Unhandled Stripe webhook event type: ${eventType}`);
      }

      // Respond to Stripe immediately
      res.json({ received: true });
    } catch (error: any) {
      console.error("Stripe webhook error:", error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Serve uploaded files (legacy filesystem - for development only)
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

  // Serve images from object storage (production persistent storage)
  app.get("/objects/*", async (req, res) => {
    try {
      const objectStorage = new ObjectStorageService();
      const objectPath = req.path; // e.g., /objects/artwork-uploads/123-image.jpg
      const file = await objectStorage.getFile(objectPath);
      await objectStorage.downloadObject(file, res);
    } catch (error: any) {
      if (error.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Image not found" });
      }
      console.error("Object storage error:", error);
      return res.status(500).json({ error: "Failed to retrieve image" });
    }
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
      // Clear the session cookie to prevent session reuse
      res.clearCookie('connect.sid');
      res.json({ message: "Logged out successfully" });
    });
  });

  // ===== ARTIST ROUTES =====

  // Register new artist
  app.post("/api/artists/register", async (req, res) => {
    try {
      // Validate TOS acceptance BEFORE parsing other fields
      const acceptTerms = req.body.acceptTerms;
      if (acceptTerms !== true) {
        return res.status(400).json({ 
          message: "You must accept the Terms of Service to register" 
        });
      }

      const data = insertArtistSchema.parse(req.body);

      const existing = await storage.getArtistByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Capture referral attribution from UTM parameters (sent in POST body from frontend)
      const referrerCode = req.body.referralCode as string | undefined;
      const utmMedium = req.body.utmMedium as string | undefined;
      let referralSource: string | null = null;
      let referredBy: string | null = null;
      
      // Determine referral source based on UTM medium
      if (utmMedium === 'testimonial') {
        referralSource = 'testimonial';
      } else if (referrerCode || utmMedium === 'referral') {
        referralSource = 'general';
      }
      
      // Look up the referring artist by their referral code
      if (referrerCode) {
        const referringArtist = await storage.getArtistByReferralCode(referrerCode);
        if (referringArtist) {
          referredBy = referringArtist.id;
        }
      }

      // Capture IP address for TOS audit trail
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() 
        || req.socket.remoteAddress 
        || 'unknown';

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const artist = await storage.createArtist({
        ...data,
        password: hashedPassword,
        referredBy, // ID of the artist who referred them
        referralSource, // How they were referred (testimonial/general)
        tosAcceptedAt: new Date(),
        tosIpAddress: ipAddress,
        tosVersion: "v1.0-2025-11", // Track TOS version for legal compliance
      } as any);

      // Check for affiliate attribution from influencer program
      const affiliateCode = getAffiliateCodeFromCookie(req);
      if (affiliateCode) {
        try {
          const influencer = await storage.getInfluencerByAffiliateCode(affiliateCode);
          if (influencer && influencer.status === "active") {
            // Create affiliate conversion record for artist signup
            await storage.createAffiliateConversion({
              influencerId: influencer.id,
              artistId: artist.id,
              conversionType: "artist_signup",
              payoutStatus: "pending", // Not paid yet
              // Commission fields null for artist signups (calculated when they make sales)
              commissionRate: null,
              commissionEarned: null,
              tierBonus: "0",
              totalPayout: null,
            });
            console.log(`Affiliate conversion tracked: Artist ${artist.id} via influencer ${influencer.id}`);
            
          }
        } catch (err) {
          // Don't fail registration if conversion tracking fails
          console.error('Failed to track affiliate conversion:', err);
        }
      }

      // Send welcome email (non-blocking)
      emailService.sendWelcomeEmail(artist.email, artist.name, artist.id)
        .catch(err => console.error('Failed to send welcome email:', err));

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

        // Explicitly save session before sending response to prevent race condition
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Registration failed" });
          }

          const { password, ...artistData } = artist;
          res.status(201).json(artistData);
        });
      });
    } catch (error: any) {
      console.error("Artist registration error:", error);
      res.status(400).json({ message: error.message || "Registration failed" });
    }
  });

  // Middleware to extend timeout for file upload routes (5 minutes instead of default 2 minutes)
  const extendTimeout = (req: any, res: any, next: any) => {
    req.setTimeout(5 * 60 * 1000); // 5 minutes
    res.setTimeout(5 * 60 * 1000); // 5 minutes  
    next();
  };

  // Portfolio-specific error handler with correct file size limits
  const handlePortfolioUploadError = (err: any, req: any, res: any, next: any) => {
    if (err) {
      if (err.message && err.message.startsWith('UNSUPPORTED_FORMAT:')) {
        const fileType = err.message.split(':')[1];
        return res.status(400).json({ 
          error: `Only PNG and JPG images are supported. Your ${fileType} file cannot be uploaded.`,
          errorType: 'UNSUPPORTED_FORMAT',
          fileType
        });
      }
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          error: 'Portfolio image is too large (maximum 10MB per image). Please compress your image and try again.',
          errorType: 'FILE_TOO_LARGE',
          maxSize: '10MB'
        });
      }
      
      if (err.code && err.code.startsWith('LIMIT_')) {
        return res.status(400).json({ 
          error: 'File upload error: ' + err.message,
          errorType: 'UPLOAD_ERROR'
        });
      }
    }
    next(err);
  };

  // Atomic registration endpoint - creates account + uploads portfolio + sets tier in one transaction
  app.post("/api/artists/register-complete", extendTimeout, portfolioUpload.array("portfolioFiles", 3), handlePortfolioUploadError, async (req: any, res: any) => {
    try {
      // Parse form data
      const acceptTerms = req.body.acceptTerms === "true";
      if (!acceptTerms) {
        return res.status(400).json({ 
          message: "You must accept the Terms of Service to register" 
        });
      }

      // Validate portfolio files
      const files = req.files as Express.Multer.File[];
      if (!files || files.length < 2) {
        return res.status(400).json({ 
          error: "Please upload at least 2 portfolio images" 
        });
      }
      if (files.length > 3) {
        return res.status(400).json({ 
          error: "Maximum 3 portfolio images allowed" 
        });
      }

      // Validate each portfolio image's quality (more lenient than print-ready requirements)
      for (const file of files) {
        const validation = validatePortfolioImageQuality(file.buffer);
        if (!validation.valid) {
          return res.status(400).json({ 
            error: `Portfolio image "${file.originalname}" ${validation.message || "does not meet quality requirements"}`,
            minLongSide: PORTFOLIO_MIN_LONG_SIDE,
            minShortSide: PORTFOLIO_MIN_SHORT_SIDE,
            actualDimensions: validation.dimensions
          });
        }
      }

      // Validate account data
      const accountData = insertArtistSchema.parse({
        email: req.body.email,
        password: req.body.password,
        name: req.body.name,
        artistShort: req.body.artistShort,
      });

      // Check if email already exists (including soft-deleted accounts — email remains taken in DB)
      const [existingByEmail] = await db
        .select({ id: artists.id })
        .from(artists)
        .where(eq(artists.email, accountData.email))
        .limit(1);
      if (existingByEmail) {
        return res.status(400).json({
          message: "This email is already associated with an account. If you previously deleted your account, please contact support to reactivate it.",
          errorCode: "EMAIL_EXISTS",
        });
      }

      // Prepare referral data
      const referrerCode = req.body.referralCode as string | undefined;
      const utmMedium = req.body.utmMedium as string | undefined;
      let referralSource: string | null = null;
      let referredBy: string | null = null;
      
      if (utmMedium === 'testimonial') {
        referralSource = 'testimonial';
      } else if (referrerCode || utmMedium === 'referral') {
        referralSource = 'general';
      }
      
      if (referrerCode) {
        const referringArtist = await storage.getArtistByReferralCode(referrerCode);
        if (referringArtist) {
          referredBy = referringArtist.id;
        }
      }

      // Capture IP address
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() 
        || req.socket.remoteAddress 
        || 'unknown';

      // Hash password
      const hashedPassword = await bcrypt.hash(accountData.password, 10);

      // Generate unique referral code for the new artist
      const referralCode = generateReferralCode(accountData.name);

      // Parse optional portfolio links
      const instagramUrl = req.body.instagramUrl as string | undefined;
      const websiteUrl = req.body.websiteUrl as string | undefined;
      
      // Build socialLinks JSONB object if any links provided
      let socialLinks = null;
      if (instagramUrl || websiteUrl) {
        socialLinks = {
          instagram: instagramUrl || null,
          website: websiteUrl || null,
        };
      }

      // 1. Create artist account
      const [artist] = (await db
        .insert(storage.getArtistsTable())
        .values({
          ...accountData,
          password: hashedPassword,
          referralCode,
          referredBy,
          referralSource,
          socialLinks,
          tosAcceptedAt: new Date(),
          tosIpAddress: ipAddress,
          tosVersion: "v1.0-2025-11",
        } as any)
        .returning()) as any[];

      // 2. Upload portfolio files to object storage and create records
      const objectStorage = new ObjectStorageService();
      const portfolioSubmissions = [];
      console.log(`[Portfolio] Processing ${files.length} file(s) for artist ${artist.id}`);

      for (const file of files) {
        // Compress images before upload to reduce upload time and storage costs
        // Portfolio images don't need ultra-high quality, 1920px width is plenty
        let processedBuffer = file.buffer;
        let contentType = file.mimetype; // Preserve original MIME type by default
        let shouldCompress = false;
        
        const metadata = await sharp(file.buffer).metadata();
        const width = metadata.width || 2000;
        
        // Compress if image is larger than 1920px or file size > 2MB
        if (width > 1920 || file.size > 2 * 1024 * 1024) {
          processedBuffer = await sharp(file.buffer)
            .resize(1920, null, { withoutEnlargement: true, fit: 'inside' })
            .jpeg({ quality: 85, progressive: true })
            .toBuffer();
          
          contentType = 'image/jpeg'; // Only set to JPEG when actually converting
          shouldCompress = true;
          
          console.log(`[Portfolio Upload] Compressed ${file.originalname}: ${(file.size / 1024 / 1024).toFixed(2)}MB â†’ ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB`);
        }
        
        // Preserve original filename unless we compressed to JPEG
        const safeName = file.originalname.replace(/\s+/g, "-").toLowerCase();
        const baseFilename = safeName.replace(/\.(png|jpg|jpeg)$/i, '');
        const extension = shouldCompress ? 'jpg' : safeName.split('.').pop() || 'jpg';
        const filename = `${Date.now()}-${baseFilename}.${extension}`;
        
        let imageUrl: string;
        try {
          imageUrl = await objectStorage.uploadFile({
            directory: 'artworks',
            filename,
            buffer: processedBuffer,
            contentType,
          });
          console.log(`[Portfolio] Uploaded ${file.originalname} → ${imageUrl}`);
        } catch (uploadErr: any) {
          console.error(`[Portfolio] Upload FAILED for ${file.originalname}:`, uploadErr.message);
          throw uploadErr;
        }

        let submission: any;
        try {
          const [row] = (await db
            .insert(storage.getPortfolioSubmissionsTable())
            .values({ artistId: artist.id, imageUrl } as any)
            .returning()) as any[];
          submission = row;
          console.log(`[Portfolio] DB insert OK, submission id=${submission?.id}`);
        } catch (dbErr: any) {
          console.error(`[Portfolio] DB insert FAILED:`, dbErr.message);
          throw dbErr;
        }
        portfolioSubmissions.push(submission);
      }

      console.log(`[Registration Complete] Artist ${artist.id} created with ${portfolioSubmissions.length} portfolio images`);

      // Handle affiliate tracking (outside transaction, non-critical)
      const affiliateCode = getAffiliateCodeFromCookie(req);
      if (affiliateCode) {
        try {
          const influencer = await storage.getInfluencerByAffiliateCode(affiliateCode);
          if (influencer && influencer.status === "active") {
            await storage.createAffiliateConversion({
              influencerId: influencer.id,
              artistId: artist.id,
              conversionType: "artist_signup",
              payoutStatus: "pending",
              commissionRate: null,
              commissionEarned: null,
              tierBonus: "0",
              totalPayout: null,
            });
            console.log(`Affiliate conversion tracked: Artist ${artist.id} via influencer ${influencer.id}`);
          }
        } catch (err) {
          console.error('Failed to track affiliate conversion:', err);
        }
      }

      // Send welcome email (non-blocking)
      emailService.sendWelcomeEmail(artist.email, artist.name, artist.id)
        .catch(err => console.error('Failed to send welcome email:', err));

      // Regenerate session and automatically log in the new artist
      req.session.regenerate((err: Error | null) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Registration completed but login failed. Please try logging in." });
        }

        // Set session
        req.session.user = {
          id: artist.id,
          email: artist.email,
          name: artist.name,
          type: "artist",
          approved: artist.approved,
        };

        // Explicitly save session before sending response to prevent race condition
        req.session.save((saveErr: Error | null) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Registration completed but login failed. Please try logging in." });
          }

          const { password, ...artistData } = artist;
          res.status(201).json({
            ...artistData,
            portfolioCount: portfolioSubmissions.length,
          });
        });
      });
    } catch (error: any) {
      console.error("Atomic registration error:", error);
      
      // Handle specific error types with user-friendly messages
      if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
        return res.status(408).json({ 
          message: "Registration is taking longer than expected. Please try again with smaller images (under 5MB each).",
          errorType: 'TIMEOUT'
        });
      }
      
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          message: "One or more portfolio images exceed the 10MB size limit. Please compress your images and try again.",
          errorType: 'FILE_TOO_LARGE'
        });
      }
      
      // Always return JSON, never HTML
      res.status(400).json({ 
        message: error.message || "Registration failed. Please try again.",
        errorType: error.code || 'UNKNOWN_ERROR'
      });
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

      // SECURITY: never log a password or a stored hash. Both were being
      // printed here in plaintext, which puts live credentials into terminal
      // scrollback, CI output, and any log aggregator the app is pointed at.
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

        console.log("[DEBUG][LOGIN] Session user set:", {
          sessionID: req.sessionID,
          user: req.session.user,
          cookie: req.session.cookie
        });

        // Explicitly save session before sending response to prevent race condition
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Login failed" });
          }

          console.log("[DEBUG][LOGIN] Session saved successfully:", {
            sessionID: req.sessionID,
            userInSession: req.session.user,
            cookieSecure: req.session.cookie.secure,
            cookieSameSite: req.session.cookie.sameSite
          });

          // Log response headers to debug cookie delivery
          res.once('finish', () => {
            console.log("[DEBUG][LOGIN] Response headers sent:", {
              sessionID: req.sessionID,
              setCookie: res.getHeader('set-cookie'),
              allHeaders: res.getHeaders()
            });
          });

          const { password: _, ...artistData} = artist;
          res.json(artistData);
        });

      });
    } catch (error: any) {
      console.error("Artist login error:", error);
      res.status(400).json({ message: error.message || "Login failed" });
    }
  });

  // PUBLIC: List all approved artists (for creators page)
  // Also supports ?email=xyz query param for registration validation
  app.get("/api/artists", async (req, res) => {
    try {
      const { email } = req.query;
      
      // If email query param provided, check if artist exists (for registration validation)
      if (email && typeof email === 'string') {
        const artist = await storage.getArtistByEmail(email);
        return res.json(artist ? [artist] : []);
      }
      
      // Otherwise, return all approved artists with essential public info
      const allArtists = await storage.getAllArtists();
      
      const approvedArtists = allArtists
        .filter(artist => artist.approved)
        .map(artist => ({
          id: artist.id,
          name: artist.name,
          bio: artist.bio,
          royaltyTier: null, // Can add later
          totalSales: 0, // Can add later
          shopifyCollectionHandle: null, // Can add later
        }));

      res.json(approvedArtists);
    } catch (error: any) {
      console.error("Error fetching artists:", error);
      res.status(500).json({ message: "Failed to fetch artists" });
    }
  });

  // PUBLIC: Get artist profile (for customer-facing artist pages)
  app.get("/api/artists/:id", async (req, res) => {
    try {
      const id = req.params.id as string;
      const artist = await storage.getArtist(id);

      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Only show approved artists
      if (!artist.approved) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Return public artist info only (match PublicArtistProfile type on frontend)
      res.json({
        id: artist.id,
        name: artist.name,
        bio: artist.bio || null,
        tagline: null, // Not in schema yet
        royaltyTier: null, // Calculated field - not in schema yet
        totalSales: 0, // Calculated field - not in schema yet
        shopifyCollectionHandle: null, // Not in schema yet
      });
    } catch (error) {
      console.error("Error fetching public artist:", error);
      res.status(500).json({ message: "Failed to fetch artist" });
    }
  });

  // PUBLIC: Get artist artworks (for customer-facing artist pages)
  app.get("/api/artists/:id/artworks", async (req, res) => {
    try {
      const id = req.params.id as string;
      const artist = await storage.getArtist(id);

      if (!artist || !artist.approved) {
        return res.status(404).json({ message: "Artist not found" });
      }

      const artworks = await storage.getArtworksByArtist(id);
      
      // Only show approved, non-archived artworks with absolute URLs
      const publicArtworks = artworks
        .filter(a => a.status === "approved" && !a.archivedAt)
        .map(artwork => ({
          id: artwork.id,
          title: artwork.title,
          description: artwork.description,
          imageUrl: toAbsoluteUrl(artwork.imageUrl, req),
          status: artwork.status,
        }));

      res.json(publicArtworks);
    } catch (error) {
      console.error("Error fetching artist artworks:", error);
      res.status(500).json({ message: "Failed to fetch artworks" });
    }
  });

  // Get all artists (admin only)
  app.get("/api/admin/artists", requireAdmin, async (_req, res) => {
    try {
      const artists = await storage.getAllArtists();
      const sanitized = artists.map(({ password, ...artist }) => artist);
      res.json(sanitized);
    } catch (error: any) {
      console.error("Get artists error:", error);
      res.status(500).json({ message: "Failed to fetch artists" });
    }
  });

  // Get single artist details (admin only)
  app.get("/api/admin/artists/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const artist = await storage.getArtist(id);
      
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Return full artist data (excluding password) for admin view
      const { password, ...artistData } = artist;
      res.json(artistData);
    } catch (error: any) {
      console.error("Get artist details error:", error);
      res.status(500).json({ message: "Failed to fetch artist details" });
    }
  });

  // Approve artist (admin only)
  app.post("/api/artists/:id/approve", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const artist = await storage.updateArtist(id, { approved: true });
      
      // Send portfolio approval email (non-blocking)
      emailService.sendPortfolioDecisionEmail(artist.email, artist.name, artist.id, true)
        .catch(err => console.error('Failed to send portfolio approval email:', err));
      
      const { password, ...artistData } = artist;
      res.json(artistData);
    } catch (error: any) {
      console.error("Approve artist error:", error);
      res.status(500).json({ message: "Failed to approve artist" });
    }
  });

  // Bulk artist operations (admin only) - approve or reject multiple artists
  app.post("/api/artists/bulk", requireAdmin, async (req, res) => {
    try {
      const { artistIds, action } = req.body;

      if (!Array.isArray(artistIds) || artistIds.length === 0) {
        return res.status(400).json({ message: "artistIds must be a non-empty array" });
      }

      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
      }

      const results: Array<{ artistId: string; success: boolean; error?: string }> = [];
      let successCount = 0;
      let failureCount = 0;

      // Process each artist sequentially to avoid overwhelming email service
      for (const artistId of artistIds) {
        try {
          const artist = await storage.getArtist(artistId);
          if (!artist) {
            results.push({ artistId, success: false, error: "Artist not found" });
            failureCount++;
            continue;
          }

          if (action === "approve") {
            // Approve artist
            await storage.updateArtist(artistId, { approved: true });

            // Send approval email (non-blocking)
            emailService.sendPortfolioDecisionEmail(artist.email, artist.name, artist.id, true)
              .catch(err => console.error(`Failed to send approval email for artist ${artistId}:`, err));

            results.push({ artistId, success: true });
            successCount++;
          } else {
            // Reject artist (soft delete)
            await storage.deleteArtist(artistId);

            // Send rejection email (non-blocking)
            emailService.sendPortfolioDecisionEmail(artist.email, artist.name, artist.id, false)
              .catch(err => console.error(`Failed to send rejection email for artist ${artistId}:`, err));

            results.push({ artistId, success: true });
            successCount++;
          }
        } catch (error: any) {
          console.error(`Bulk operation failed for artist ${artistId}:`, error);
          results.push({ artistId, success: false, error: error.message });
          failureCount++;
        }
      }

      res.json({
        totalProcessed: artistIds.length,
        successCount,
        failureCount,
        results,
      });
    } catch (error: any) {
      console.error("Bulk artist operation error:", error);
      res.status(500).json({ message: error.message || "Failed to process bulk operation" });
    }
  });

  // Batch email to artists (admin only)
  app.post("/api/artists/batch-email", requireAdmin, async (req, res) => {
    try {
      const { artistIds, subject, message } = req.body;

      if (!Array.isArray(artistIds) || artistIds.length === 0) {
        return res.status(400).json({ message: "artistIds must be a non-empty array" });
      }

      if (!subject || !subject.trim()) {
        return res.status(400).json({ message: "subject is required" });
      }

      if (!message || !message.trim()) {
        return res.status(400).json({ message: "message is required" });
      }

      const results: Array<{ artistId: string; success: boolean; error?: string }> = [];
      let successCount = 0;
      let failureCount = 0;

      // Process each artist sequentially to avoid rate limiting
      for (const artistId of artistIds) {
        try {
          const artist = await storage.getArtist(artistId);
          if (!artist) {
            results.push({ artistId, success: false, error: "Artist not found" });
            failureCount++;
            continue;
          }

          // Send custom email using the base sendEmail method
          const result = await emailService.sendEmail({
            recipientEmail: artist.email,
            recipientType: 'artist',
            recipientId: artist.id,
            emailType: 'custom',
            subject: subject.trim(),
            htmlBody: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Hello ${artist.name},</h2>
                <div style="margin: 20px 0; line-height: 1.6;">
                  ${message.trim().replace(/\n/g, '<br>')}
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #666; font-size: 12px;">
                  This is an official message from 369 Art Collective administration.
                </p>
              </div>
            `,
            textBody: `Hello ${artist.name},\n\n${message.trim()}\n\n---\nThis is an official message from 369 Art Collective administration.`,
            metadata: { adminSent: true, batchEmail: true },
          });

          if (result.success) {
            results.push({ artistId, success: true });
            successCount++;
          } else {
            results.push({ artistId, success: false, error: result.error || "Email send failed" });
            failureCount++;
          }
        } catch (error: any) {
          console.error(`Batch email failed for artist ${artistId}:`, error);
          results.push({ artistId, success: false, error: error.message });
          failureCount++;
        }
      }

      res.json({
        totalProcessed: artistIds.length,
        successCount,
        failureCount,
        results,
      });
    } catch (error: any) {
      console.error("Batch email error:", error);
      res.status(500).json({ message: error.message || "Failed to send batch emails" });
    }
  });

  // Delete artist (admin only)
  app.post("/api/admin/artists/:id/delete", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
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

  // Update admin notes for artist (admin only)
  app.patch("/api/admin/artists/:id/notes", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { adminNotes } = req.body;

      if (typeof adminNotes !== 'string') {
        return res.status(400).json({ message: "Admin notes must be a string" });
      }

      const artist = await storage.getArtist(id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      const updatedArtist = await storage.updateArtist(id, { adminNotes });
      const { password, ...artistData } = updatedArtist;
      
      res.json(artistData);
    } catch (error: any) {
      console.error("Update admin notes error:", error);
      res.status(500).json({ message: "Failed to update admin notes" });
    }
  });

  // Get single artist details (admin only) - REMOVED - now uses /api/admin/artists/:id above

  // Get artist's portfolio submissions (admin only)
  app.get("/api/admin/artists/:id/portfolio", requireAdmin, async (req, res) => {
    try {
      const artistId = req.params.id as string;
      const portfolioSubmissions = await storage.getPortfolioSubmissionsByArtist(artistId);
      
      // Convert relative URLs to absolute URLs
      const normalizedSubmissions = portfolioSubmissions.map(submission => ({
        ...submission,
        imageUrl: toAbsoluteUrl(submission.imageUrl, req),
      }));
      
      res.json(normalizedSubmissions);
    } catch (error: any) {
      console.error("Get portfolio error:", error);
      res.status(500).json({ message: "Failed to fetch portfolio submissions" });
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

  // Stripe Connect: Create or get onboarding link (artist only)
  app.post("/api/artists/stripe/onboarding-link", requireArtist, async (req, res) => {
    try {
      const user = req.user!;
      
      // Fetch full artist record to access Stripe fields
      const artist = await storage.getArtist(user.id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Determine return/refresh URLs using request host
      const protocol = req.protocol;
      const host = req.get('host');
      const baseUrl = `${protocol}://${host}`;
      const returnUrl = `${baseUrl}/artist/settings?stripe=success`;
      const refreshUrl = `${baseUrl}/artist/settings?stripe=refresh`;

      // Create or regenerate account link
      const result = await stripeConnectService.createAccountLink({
        artistId: artist.id,
        artistEmail: artist.email,
        stripeAccountId: artist.stripeAccountId || undefined,
        returnUrl,
        refreshUrl,
      });

      // Update artist with new Stripe account ID and link expiration
      const linkExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      await storage.updateArtist(artist.id, {
        stripeAccountId: result.accountId,
        stripeAccountLinkExpiresAt: linkExpiresAt,
      });

      res.json({ url: result.url, expiresAt: linkExpiresAt.toISOString() });
    } catch (error: any) {
      console.error("Stripe onboarding link error:", error);
      res.status(500).json({ message: "Failed to create Stripe onboarding link" });
    }
  });

  // Stripe Connect: Refresh account status (artist only)
  app.post("/api/artists/stripe/refresh-status", requireArtist, async (req, res) => {
    try {
      const user = req.user!;
      
      // Fetch full artist record to access Stripe fields
      const artist = await storage.getArtist(user.id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      if (!artist.stripeAccountId) {
        return res.status(400).json({ message: "No Stripe account linked" });
      }

      // Fetch current status from Stripe
      const status = await stripeConnectService.getAccountStatus(artist.stripeAccountId);

      // Update artist record with latest status
      await storage.updateArtist(artist.id, {
        stripeChargesEnabled: status.charges_enabled,
        stripePayoutsEnabled: status.payouts_enabled,
        stripeDetailsSubmitted: status.details_submitted,
        stripeRequirements: status.requirements,
        stripeDefaultCurrency: status.default_currency,
        externalAccountLast4: status.external_account_last4,
        stripeOnboardingComplete: status.details_submitted && status.charges_enabled && status.payouts_enabled,
      });

      res.json({
        onboardingComplete: status.details_submitted && status.charges_enabled && status.payouts_enabled,
        chargesEnabled: status.charges_enabled,
        payoutsEnabled: status.payouts_enabled,
        detailsSubmitted: status.details_submitted,
        requirements: status.requirements,
        defaultCurrency: status.default_currency,
        externalAccountLast4: status.external_account_last4,
      });
    } catch (error: any) {
      console.error("Stripe refresh status error:", error);
      res.status(500).json({ message: "Failed to refresh Stripe status" });
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
      const id = req.params.id as string;
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
      
      // Send password reset email (non-blocking)
      emailService.sendPasswordResetEmail(email, 'artist', plainToken)
        .catch(err => console.error('Failed to send password reset email:', err));

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
      
      // Send password reset email (non-blocking)
      emailService.sendPasswordResetEmail(email, 'admin', plainToken)
        .catch(err => console.error('Failed to send password reset email:', err));

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
      const id = req.params.id as string;
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

      // SECURITY: see the note on the artist login above. Never log credentials.
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

        // Explicitly save session before sending response to prevent race condition
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Login failed" });
          }

          console.log("Admin logged in - session created:", {
            sessionID: req.sessionID,
            userType: req.session.user?.type,
            userId: req.session.user?.id,
          });

          const { password: _, ...adminData } = admin;
          res.json(adminData);
        });
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

  // ===== INFLUENCER AFFILIATE PROGRAM ROUTES =====

  // Public: Influencer application
  app.post("/api/influencers/apply", async (req, res) => {
    try {
      const data = influencerApplicationSchema.parse(req.body);

      // Check for existing email
      const existing = await storage.getInfluencerByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Create influencer with pending status (no affiliateCode yet - generated on approval)
      const influencer = await storage.createInfluencer({
        ...data,
        password: hashedPassword,
        status: "pending",
        currentTier: "bronze",
      });

      // Send welcome/pending email (non-blocking)
      emailService.sendInfluencerApplicationEmail(
        influencer.email,
        influencer.name,
        influencer.id
      ).catch(err => {
        console.error('Failed to send influencer application email:', err);
        // Non-blocking: continue even if email fails
      });

      const { password: _, ...influencerData } = influencer;
      res.status(201).json(influencerData);
    } catch (error: any) {
      console.error("Influencer application error:", error);
      res.status(400).json({ message: error.message || "Application failed" });
    }
  });

  // Public: Influencer login
  app.post("/api/influencers/login", loginLimiter, async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const influencer = await storage.getInfluencerByEmail(email);
      if (!influencer) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, influencer.password);
      
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Login failed" });
        }

        // Set session with influencer type
        req.session.user = {
          id: influencer.id,
          email: influencer.email,
          name: influencer.name,
          type: "influencer",
          status: influencer.status,
        };

        const { password: _, ...influencerData } = influencer;
        res.json(influencerData);
      });
    } catch (error: any) {
      console.error("Influencer login error:", error);
      res.status(400).json({ message: error.message || "Login failed" });
    }
  });

  // Protected: Get influencer profile
  app.get("/api/influencers/me", requireInfluencer, async (req, res) => {
    try {
      const influencer = await storage.getInfluencer(req.user!.id);
      if (!influencer) {
        return res.status(404).json({ message: "Influencer not found" });
      }

      const { password: _, ...influencerData } = influencer;
      res.json(influencerData);
    } catch (error: any) {
      console.error("Get influencer profile error:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Protected: Get influencer performance stats
  app.get("/api/influencers/performance", requireInfluencer, async (req, res) => {
    try {
      const stats = await storage.getInfluencerPerformanceSummary(req.user!.id);
      res.json(stats);
    } catch (error: any) {
      console.error("Get influencer performance error:", error);
      res.status(500).json({ message: "Failed to fetch performance stats" });
    }
  });

  // ====================
  // Admin: Get all influencers
  app.get("/api/admin/influencers", requireAdmin, async (req, res) => {
    try {
      const { status, search } = req.query as { status?: string; search?: string };
      const influencers = await storage.getAllInfluencers({ status, search });
      
      // Remove passwords from response
      const sanitized = influencers.map(({ password, ...data }) => data);
      res.json(sanitized);
    } catch (error: any) {
      console.error("Get all influencers error:", error);
      res.status(500).json({ message: "Failed to fetch influencers" });
    }
  });

  // Admin: Get specific influencer with performance stats
  app.get("/api/admin/influencers/:id", requireAdmin, async (req, res) => {
    try {
      const influencer = await storage.getInfluencer(req.params.id as string);
      if (!influencer) {
        return res.status(404).json({ message: "Influencer not found" });
      }

      // Get performance stats
      const stats = await storage.getInfluencerPerformanceSummary(req.params.id as string);

      const { password: _, ...influencerData } = influencer;
      res.json({ ...influencerData, stats });
    } catch (error: any) {
      console.error("Get influencer details error:", error);
      res.status(500).json({ message: "Failed to fetch influencer details" });
    }
  });

  // Admin: Approve influencer
  app.patch("/api/admin/influencers/:id/approve", requireAdmin, async (req, res) => {
    try {
      const influencer = await storage.approveInfluencer(req.params.id as string);
      
      // Send approval email (non-blocking)
      emailService.sendInfluencerApprovalEmail(
        influencer.email,
        influencer.name,
        influencer.id,
        influencer.affiliateCode ?? ''
      ).catch(err => {
        console.error('Failed to send influencer approval email:', err);
        // Non-blocking: continue even if email fails
      });

      const { password: _, ...influencerData } = influencer;
      res.json(influencerData);
    } catch (error: any) {
      console.error("Approve influencer error:", error);
      res.status(400).json({ message: error.message || "Failed to approve influencer" });
    }
  });

  // Admin: Update influencer (for admin notes, custom rates, etc.)
  app.patch("/api/admin/influencers/:id", requireAdmin, async (req, res) => {
    try {
      // Allow admins to update specific fields
      const allowedUpdates = ['adminNotes', 'commissionRate', 'status'];
      const updates: any = {};
      
      for (const field of allowedUpdates) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const influencer = await storage.updateInfluencer((req.params.id as string), updates);
      const { password: _, ...influencerData } = influencer;
      res.json(influencerData);
    } catch (error: any) {
      console.error("Update influencer error:", error);
      res.status(400).json({ message: error.message || "Failed to update influencer" });
    }
  });

  // ===== ARTWORK ROUTES =====

  // Upload file (requires artist auth)
  app.post("/api/upload", requireArtist, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Check upload limits before accepting file
      const artist = await storage.getArtistById(req.user!.id);
      if (!artist) {
        return res.status(404).json({ error: "Artist not found" });
      }

      const artworks = await storage.getArtworksByArtist(req.user!.id);
      if (artworks.length >= ARTWORK_UPLOAD_LIMIT) {
        return res.status(403).json({
          error: `Upload limit reached. Each artist may have up to ${ARTWORK_UPLOAD_LIMIT} artworks.`,
          currentCount: artworks.length,
          limit: ARTWORK_UPLOAD_LIMIT
        });
      }
      
      // Validate image quality for Printify requirements (using buffer)
      const validation = validateImageQualityFromBuffer(req.file.buffer);
      
      if (!validation.valid) {
        return res.status(400).json({ 
          error: validation.message || "Image quality check failed",
          minLongSide: MIN_LONG_SIDE,
          minShortSide: MIN_SHORT_SIDE,
          actualDimensions: validation.dimensions
        });
      }
      
      console.log(`[Upload] Image validated: ${validation.dimensions?.width}Ã—${validation.dimensions?.height} pixels`);
      
      // Upload to object storage
      const objectStorage = new ObjectStorageService();
      const safeName = req.file.originalname.replace(/\s+/g, "-").toLowerCase();
      const filename = `${Date.now()}-${safeName}`;
      const imageUrl = await objectStorage.uploadFile({
        directory: objectStorage.getArtworkUploadsDir(),
        filename,
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
      });
      
      res.status(201).json({ imageUrl });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  });

  // Upload image for upscale widget with automatic normalization
  app.post("/api/upload/design", requireArtist, upload.single("image"), handleMulterError, async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Auto-normalize image (downscale if too large, accept undersized images)
      const { ImageNormalizationService } = await import('./lib/image-normalization-service');
      const normalizationResult = await ImageNormalizationService.normalizeImage(req.file.buffer);
      
      // Note: No longer rejecting undersized images - they can be upscaled
      // The DPI validator will analyze and show upscale option if needed
      
      // Upload normalized image to object storage
      const objectStorage = new ObjectStorageService();
      const safeName = req.file.originalname.replace(/\s+/g, "-").toLowerCase();
      const filename = `${Date.now()}-${safeName}`;
      const imageUrl = await objectStorage.uploadFile({
        directory: objectStorage.getArtworkUploadsDir(),
        filename,
        buffer: normalizationResult.buffer,
        contentType: req.file.mimetype,
      });
      
      console.log(`[Upload Design] File uploaded for upscale widget: ${filename}`);
      
      // Log normalization details
      if (normalizationResult.wasModified) {
        console.log(`[IMAGE_NORMALIZED] Auto-downscaled from ${normalizationResult.originalWidth}Ã—${normalizationResult.originalHeight}px to ${normalizationResult.normalizedWidth}Ã—${normalizationResult.normalizedHeight}px`);
      }
      
      // Return URL with normalization metadata (including needsUpscale guidance)
      res.status(200).json({ 
        url: imageUrl,
        normalized: normalizationResult.wasModified,
        orientation: normalizationResult.orientation,
        needsUpscale: normalizationResult.needsUpscale || false,
        reason: normalizationResult.reason,
        customerMessage: normalizationResult.customerMessage
      });
    } catch (error: any) {
      console.error("Upload design error:", error);
      
      // Provide specific error messages based on error type
      if (error.message && error.message.includes('too small')) {
        return res.status(400).json({ 
          error: 'Image resolution is too small for print quality. Minimum requirement: 1200px on shortest side. Please use a higher resolution image or use our AI upscaler.',
          errorType: 'IMAGE_TOO_SMALL'
        });
      }
      
      if (error.message && error.message.includes('dimensions')) {
        return res.status(400).json({ 
          error: error.message,
          errorType: 'IMAGE_VALIDATION_ERROR'
        });
      }
      
      res.status(500).json({ 
        error: error.message || 'Failed to process image upload. Please try again.',
        errorType: 'UPLOAD_ERROR'
      });
    }
  });

  // Portfolio upload during registration (2-3 images required)
  // Note: Allows unapproved artists (they just registered)
  app.post("/api/artists/portfolio", requireAuth, upload.array("files", 3), async (req, res) => {
    // Verify artist type (but allow unapproved artists)
    if (req.session?.user?.type !== "artist") {
      return res.status(403).json({ message: "Artist access required" });
    }
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }
      
      // Enforce 2-3 image requirement
      if (files.length < 2) {
        return res.status(400).json({ error: "Please upload at least 2 portfolio images" });
      }
      
      if (files.length > 3) {
        return res.status(400).json({ error: "Maximum 3 portfolio images allowed" });
      }
      
      // Validate each image's quality
      const validatedFiles = [];
      for (const file of files) {
        const validation = validateImageQualityFromBuffer(file.buffer);
        
        if (!validation.valid) {
          return res.status(400).json({ 
            error: `Image "${file.originalname}" ${validation.message || "does not meet quality requirements"}`,
            minLongSide: MIN_LONG_SIDE,
            minShortSide: MIN_SHORT_SIDE,
            actualDimensions: validation.dimensions
          });
        }
        
        validatedFiles.push({
          originalname: file.originalname,
          dimensions: validation.dimensions
        });
      }
      
      console.log(`[Portfolio Upload] ${files.length} images validated for artist ${req.user!.id}`);
      
      // Upload all files to object storage and create portfolio submission records
      const objectStorage = new ObjectStorageService();
      const portfolioSubmissions = [];
      
      for (const file of files) {
        const safeName = file.originalname.replace(/\s+/g, "-").toLowerCase();
        const filename = `${Date.now()}-${safeName}`;
        const imageUrl = await objectStorage.uploadFile({
          directory: objectStorage.getArtworkUploadsDir(),
          filename,
          buffer: file.buffer,
          contentType: file.mimetype,
        });
        
        const submission = await storage.createPortfolioSubmission({
          artistId: req.user!.id,
          imageUrl,
        });
        portfolioSubmissions.push(submission);
      }
      
      res.status(201).json({ 
        message: "Portfolio uploaded successfully",
        count: portfolioSubmissions.length,
        submissions: portfolioSubmissions
      });
    } catch (error: any) {
      console.error("Portfolio upload error:", error);
      res.status(500).json({ error: error.message || "Portfolio upload failed" });
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

      // Enforce IP declaration at API level (belt & suspenders with Zod validation)
      if (!data.ipDeclarationAccepted) {
        return res.status(400).json({ 
          message: "You must confirm you have rights to this artwork" 
        });
      }

      // Get artist data for subscription tier
      const artist = await storage.getArtistById(req.user!.id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Generate SEO-friendly slug from title if not provided
      const seoSlug = data.seoSlug || data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Capture IP declaration text snapshot for legal evidence
      const ipDeclarationText = "I confirm that I own the rights to this artwork and it does not violate any trademarks, copyrights, or other intellectual property rights. I understand that uploading artwork containing brand logos, copyrighted characters, or other protected content will result in immediate removal and forfeiture of any pending earnings.";

      try {
        // Use transactional method that enforces limit atomically
        const artwork = await storage.createArtworkWithLimitCheck(
          {
            ...data,
            seoSlug,
            ipDeclarationText,
          } as any,
          ARTWORK_UPLOAD_LIMIT
        );
        
        res.status(201).json(normalizeArtwork(artwork, req));
      } catch (limitError: any) {
        // Check if this is a limit exceeded error
        if (limitError.message && limitError.message.includes("Upload limit reached")) {
          const artworks = await storage.getArtworksByArtist(req.user!.id);
          return res.status(403).json({ 
            message: limitError.message,
            currentCount: artworks.length,
            limit: ARTWORK_UPLOAD_LIMIT
          });
        }
        // Re-throw other errors to outer catch
        throw limitError;
      }
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
      const id = req.params.id as string;
      
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

  // Get archived artworks for current artist
  app.get("/api/artworks/my-archived", requireArtist, async (req, res) => {
    try {
      const allArtworks = await storage.getArtworksByArtist(req.user!.id);
      const archivedArtworks = allArtworks.filter(a => a.archivedAt !== null);
      res.json(archivedArtworks.map(a => normalizeArtwork(a, req)));
    } catch (error: any) {
      console.error("Get my archived artworks error:", error);
      res.status(500).json({ message: "Failed to fetch archived artworks" });
    }
  });

  // Reactivate own archived artwork (artist)
  app.post("/api/artworks/:id/my-reactivate", requireArtist, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const artwork = await storage.getArtwork(id);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }

      // Verify artwork belongs to authenticated artist
      if (artwork.artistId !== req.user!.id) {
        return res.status(403).json({ message: "Not authorized to reactivate this artwork" });
      }

      if (!artwork.archivedAt) {
        return res.status(400).json({ message: "Artwork is not archived" });
      }

      const reactivated = await storage.reactivateArtwork(id);
      
      // TODO: Re-publish to Shopify when integration is complete
      console.log(`Artwork ${id} reactivated by artist, Shopify re-publish to be implemented`);
      
      res.json(normalizeArtwork(reactivated, req));
    } catch (error: any) {
      console.error("Reactivate own artwork error:", error);
      res.status(500).json({ message: error.message || "Failed to reactivate artwork" });
    }
  });

  // Approve artwork and create Printify + Shopify products (admin only)
  app.post("/api/artworks/:id/approve", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
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
      const publicUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5000';
      
      const imageUrl = artwork.imageUrl.startsWith("http") 
        ? artwork.imageUrl 
        : `${publicUrl}${artwork.imageUrl}`;
      
      console.log(`[Artwork Approval] Constructed image URL: ${imageUrl}`);

      let printifyProductId = null;
      let printifyImageId = null;
      let shopifyProductId = null;

      // Step 1: Create Printify product (PRIORITY - this is the fulfillment source)
      if (isPrintifyConfigured()) {
        try {
          console.log("Creating Printify product for artwork:", id);
          
          // Get image dimensions for variant qualification
          let dimensions = null;
          
          // Strip query params and hash first to get clean URL/path
          const cleanUrl = artwork.imageUrl.split('?')[0].split('#')[0];
          
          // Normalize protocol-relative URLs and extract path component safely
          let normalizedUrl = cleanUrl;
          if (normalizedUrl.startsWith("//")) {
            normalizedUrl = "https:" + normalizedUrl; // Convert //cdn.example.com to https://cdn.example.com
          }
          
          // Extract path component using URL API with synthetic base for robustness
          let pathComponent: string;
          try {
            const url = new URL(normalizedUrl, 'https://dummy');
            pathComponent = url.pathname;
          } catch {
            // If URL parsing fails, treat as bare path
            pathComponent = normalizedUrl;
          }
          
          // Determine storage location and read dimensions accordingly
          const appHost = process.env.PUBLIC_APP_URL ? new URL(process.env.PUBLIC_APP_URL).host : '';
          const isSameOriginOrBare = !normalizedUrl.startsWith("http") ||
                                      (appHost && normalizedUrl.includes(appHost)) ||
                                      normalizedUrl.includes("localhost");
          const isObjectStorage = isSameOriginOrBare && 
                                  (pathComponent.startsWith("/objects/") || pathComponent.startsWith("objects/"));
          const isLegacyUpload = !normalizedUrl.startsWith("http") && pathComponent.startsWith("/uploads/");
          
          if (isObjectStorage) {
            // Image is in object storage - read from there
            try {
              const objectStorage = new ObjectStorageService();
              // Ensure path starts with / for getFile() method (it expects /objects/...)
              const objectKey = pathComponent.startsWith('/') ? pathComponent : `/${pathComponent}`;
              const imageBuffer = await objectStorage.readObjectAsBuffer(objectKey);
              dimensions = getImageDimensionsFromBuffer(imageBuffer);
              
              if (!dimensions) {
                console.warn("Could not parse image dimensions from object storage buffer");
                throw new Error("Image dimensions unavailable - cannot qualify variants. Please re-upload artwork.");
              }
              
              console.log(`Image dimensions from object storage: ${dimensions.width}Ã—${dimensions.height}px`);
            } catch (dimensionError: any) {
              console.error("Failed to read image dimensions from object storage:", dimensionError);
              throw new Error("Image dimensions unavailable - cannot qualify variants. Please re-upload artwork.");
            }
          } else if (isLegacyUpload) {
            // Legacy filesystem path - read from local uploads directory
            try {
              const imagePath = path.join(uploadDir, path.basename(pathComponent));
              if (fs.existsSync(imagePath)) {
                dimensions = getImageDimensions(imagePath);
                if (!dimensions) throw new Error("Image dimensions unavailable - cannot qualify variants. Please re-upload artwork.");
                console.log(`Image dimensions from legacy filesystem: ${dimensions.width}Ã—${dimensions.height}px`);
              } else {
                throw new Error("Legacy image file not found on filesystem");
              }
            } catch (dimensionError: any) {
              console.error("Failed to read image dimensions from legacy filesystem:", dimensionError);
              throw new Error("Image dimensions unavailable - cannot qualify variants. Please re-upload artwork.");
            }
          } else {
            // External HTTP URL - download it to get dimensions
            try {
              const response = await fetch(normalizedUrl); // Use normalizedUrl for proper scheme
              if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
              }
              const arrayBuffer = await response.arrayBuffer();
              const imageBuffer = Buffer.from(arrayBuffer);
              dimensions = getImageDimensionsFromBuffer(imageBuffer);
              
              if (!dimensions) {
                console.warn("Could not parse image dimensions from HTTP URL buffer");
                throw new Error("Image dimensions unavailable - cannot qualify variants. Please re-upload artwork.");
              }
              
              console.log(`Image dimensions from HTTP URL: ${dimensions.width}Ã—${dimensions.height}px`);
            } catch (dimensionError: any) {
              console.error("Failed to read image dimensions from HTTP URL:", dimensionError);
              throw new Error("Image dimensions unavailable - cannot qualify variants. Please re-upload artwork.");
            }
          }
          
          const printifyResult = await createWallArtProducts(
            imageUrl,
            artwork.title,
            dimensions!.width,
            dimensions!.height,
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

      // Step 2: Create Shopify product (for storefront) with enhanced marketing content
      // Automatic template assignment based on product type
      const productType = artwork.productType || "art_print";
      let shopifyTemplate = null;
      
      if (isShopifyConfigured()) {
        try {
          const { getShopifyTemplate } = await import("./lib/product-types");
          shopifyTemplate = getShopifyTemplate(productType);
          
          const shopifyProduct = await createArtworkProduct({
            title: artwork.title,
            description: artwork.description || undefined,
            artistName: artist.name,
            artistShort: artist.artistShort,
            artworkId: id,
            imageUrl,
            tags: artwork.tags || [],
            artworkStory: artwork.artworkStory || undefined,
            styleTags: artwork.styleTags || undefined,
            suggestedUse: artwork.suggestedUse || undefined,
            seoSlug: artwork.seoSlug || undefined,
            productType,
          });

          shopifyProductId = shopifyProduct.product.id.toString();
          console.log(`Shopify product created with template "${shopifyTemplate}" and marketing content:`, shopifyProductId);
        } catch (error: any) {
          console.error("Shopify product creation failed:", error);
          // Continue even if Shopify fails - Printify is the critical part
        }
      }

      const updated = await storage.updateArtwork(id, {
        status: "approved",
        shopifyProductId,
        shopifyTemplate: shopifyTemplate || undefined,
        printifyProductId,
        printifyImageId,
      });

      // Sync Printify mockup images to Shopify (non-blocking)
      if (printifyProductId && shopifyProductId && isPrintifyConfigured() && isShopifyConfigured()) {
        (async () => {
          try {
            // Get Printify shop ID (from environment or cached)
            const { getShops } = await import("./lib/printify");
            const shops = await getShops();
            if (shops && shops.length > 0) {
              const printifyShopId = shops[0].id;
              
              console.log(`[Mockup Sync] Starting mockup sync for artwork ${id}`);
              console.log(`  Printify: ${printifyShopId}/${printifyProductId}`);
              console.log(`  Shopify: ${shopifyProductId}`);
              
              const result = await syncPrintifyMockupsWithRetry(
                printifyShopId,
                printifyProductId,
                shopifyProductId,
                3 // Max 3 retry attempts
              );
              
              if (result.success) {
                console.log(`[Mockup Sync] âœ… Successfully added ${result.mockupsAdded} mockup images to Shopify product ${shopifyProductId}`);
              } else {
                console.warn(`[Mockup Sync] âš ï¸ Mockup sync failed or incomplete:`, result.errors);
              }
            }
          } catch (error: any) {
            console.error('[Mockup Sync] Error syncing mockups:', error);
          }
        })();
      }

      // Send artwork approval email (non-blocking)
      emailService.sendArtworkDecisionEmail(artist.email, artist.name, artist.id, artwork.title, true)
        .catch(err => console.error('Failed to send artwork approval email:', err));

      res.json(normalizeArtwork(updated, req));
    } catch (error: any) {
      console.error("Approve artwork error:", error);
      res.status(500).json({ message: error.message || "Failed to approve artwork" });
    }
  });

  // Reject artwork (admin only)
  app.post("/api/artworks/:id/reject", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { reason } = req.body;

      const artwork = await storage.getArtwork(id);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }

      const artist = await storage.getArtist(artwork.artistId);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      const updated = await storage.updateArtwork(id, {
        status: "rejected",
        rejectionReason: reason || "No reason provided",
      });

      // Send artwork rejection email (non-blocking)
      emailService.sendArtworkDecisionEmail(
        artist.email, 
        artist.name, 
        artist.id, 
        artwork.title, 
        false, 
        reason
      ).catch(err => console.error('Failed to send artwork rejection email:', err));

      res.json(normalizeArtwork(updated, req));
    } catch (error: any) {
      console.error("Reject artwork error:", error);
      res.status(500).json({ message: error.message || "Failed to reject artwork" });
    }
  });

  // Flag artwork for IP violation (admin only)
  app.post("/api/artworks/:id/flag", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const data = insertViolationReportSchema.parse({
        ...req.body,
        artworkId: id,
        reporterId: req.user!.id,
      });

      const artwork = await storage.getArtwork(id);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }

      const report = await storage.createViolationReport(data);
      res.status(201).json(report);
    } catch (error: any) {
      console.error("Flag artwork error:", error);
      res.status(400).json({ message: error.message || "Failed to flag artwork" });
    }
  });

  // Get violation reports for artwork (admin only)
  app.get("/api/artworks/:id/violations", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const reports = await storage.getViolationReportsByArtwork(id);
      res.json(reports);
    } catch (error: any) {
      console.error("Get violations error:", error);
      res.status(500).json({ message: "Failed to fetch violation reports" });
    }
  });

  // Get detailed artwork metadata including upscaling data and variant qualification (admin only)
  app.get("/api/artworks/:id/details", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      // Get artwork
      const artwork = await storage.getArtwork(id);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }

      // Check if upscaling was used by looking for upscaleUsage records
      // Match either upscaledUrl (if upscaling was used) or originalUrl (if not)
      const upscaleRecords = await db
        .select()
        .from(upscaleUsage)
        .where(
          or(
            eq(upscaleUsage.upscaledUrl, artwork.imageUrl),
            eq(upscaleUsage.originalUrl, artwork.imageUrl)
          )
        )
        .orderBy(desc(upscaleUsage.createdAt))
        .limit(1);

      const upscaleRecord = upscaleRecords[0];
      
      // Determine image dimensions
      let width: number;
      let height: number;
      let upscalingUsed = false;
      let upscaleData: any = null;

      if (upscaleRecord) {
        // Check if upscaling was actually used
        upscalingUsed = upscaleRecord.upscaledUrl === artwork.imageUrl;
        
        if (upscalingUsed && upscaleRecord.upscaledWidth && upscaleRecord.upscaledHeight) {
          // Use upscaled dimensions
          width = upscaleRecord.upscaledWidth;
          height = upscaleRecord.upscaledHeight;
          upscaleData = {
            usedUpscaling: true,
            originalDimensions: {
              width: upscaleRecord.originalWidth,
              height: upscaleRecord.originalHeight,
            },
            upscaledDimensions: {
              width: upscaleRecord.upscaledWidth,
              height: upscaleRecord.upscaledHeight,
            },
            scaleFactor: upscaleRecord.upscaledWidth && upscaleRecord.originalWidth 
              ? Math.round(upscaleRecord.upscaledWidth / upscaleRecord.originalWidth)
              : null,
            status: upscaleRecord.status,
            costCents: upscaleRecord.costCents,
            quotaType: upscaleRecord.quotaType,
            tier: upscaleRecord.tier,
            createdAt: upscaleRecord.createdAt,
            completedAt: upscaleRecord.completedAt,
            errorMessage: upscaleRecord.errorMessage,
          };
        } else if (upscaleRecord.originalWidth && upscaleRecord.originalHeight) {
          // No upscaling used, use original dimensions
          width = upscaleRecord.originalWidth;
          height = upscaleRecord.originalHeight;
          upscaleData = {
            usedUpscaling: false,
            originalDimensions: {
              width: upscaleRecord.originalWidth,
              height: upscaleRecord.originalHeight,
            },
          };
        } else {
          // Dimensions not in upscale record, try to get from image
          try {
            const dimensions = await getImageDimensions(artwork.imageUrl);
            if (!dimensions) throw new Error("Could not parse image dimensions");
            width = dimensions.width;
            height = dimensions.height;
          } catch (error) {
            console.error("Failed to get image dimensions:", error);
            return res.status(500).json({
              message: "Failed to get image dimensions",
              imageUrl: artwork.imageUrl
            });
          }
        }
      } else {
        // No upscale record found, try to get dimensions from image
        try {
          const dimensions = await getImageDimensions(artwork.imageUrl);
          if (!dimensions) throw new Error("Could not parse image dimensions");
          width = dimensions.width;
          height = dimensions.height;
        } catch (error) {
          console.error("Failed to get image dimensions:", error);
          return res.status(500).json({ 
            message: "Failed to get image dimensions",
            imageUrl: artwork.imageUrl 
          });
        }
      }

      // Calculate variant qualification using DpiValidatorService
      const qualityAnalysis = DpiValidatorService.analyzePrintQuality(width, height);

      // Get qualified variant details grouped by finish type
      const variantsByFinish = {
        paper: qualityAnalysis.variantQualification.qualified.filter(v => 
          v.variantKey.startsWith('poster_')
        ),
        canvas: qualityAnalysis.variantQualification.qualified.filter(v => 
          v.variantKey.startsWith('canvas_')
        ),
        framed: qualityAnalysis.variantQualification.qualified.filter(v => 
          v.variantKey.startsWith('framed_')
        ),
        metal: qualityAnalysis.variantQualification.qualified.filter(v => 
          v.variantKey.startsWith('metal_')
        ),
      };

      res.json({
        artwork: {
          id: artwork.id,
          title: artwork.title,
          imageUrl: artwork.imageUrl,
          shopifyProductId: artwork.shopifyProductId,
          status: artwork.status,
          createdAt: artwork.createdAt,
        },
        dimensions: {
          width,
          height,
          megapixels: parseFloat(((width * height) / 1_000_000).toFixed(2)),
        },
        upscaling: upscaleData,
        quality: {
          estimatedDpi: qualityAnalysis.estimatedDpi,
          targetDpi: qualityAnalysis.targetDpi,
          meetsMinimum: qualityAnalysis.meetsMinimum,
          meetsTarget: qualityAnalysis.meetsTarget,
          qualityLevel: qualityAnalysis.qualityLevel,
          recommendation: qualityAnalysis.recommendation,
          message: qualityAnalysis.message,
          orientation: qualityAnalysis.orientation,
        },
        variants: {
          totalQualified: qualityAnalysis.variantQualification.totalQualified,
          totalVariants: qualityAnalysis.variantQualification.totalVariants,
          byFinish: {
            paper: variantsByFinish.paper.length,
            canvas: variantsByFinish.canvas.length,
            framed: variantsByFinish.framed.length,
            metal: variantsByFinish.metal.length,
          },
          qualified: qualityAnalysis.variantQualification.qualified.map(v => ({
            key: v.variantKey,
            name: v.productName,
            widthInches: v.widthInches,
            heightInches: v.heightInches,
          })),
        },
      });
    } catch (error: any) {
      console.error("Get artwork details error:", error);
      res.status(500).json({ message: "Failed to fetch artwork details" });
    }
  });

  // Get all archived artworks (admin only)
  app.get("/api/artworks/archived", requireAdmin, async (req, res) => {
    try {
      const archivedArtworks = await storage.getArchivedArtworks();
      const normalized = archivedArtworks.map(artwork => normalizeArtwork(artwork, req));
      res.json(normalized);
    } catch (error: any) {
      console.error("Get archived artworks error:", error);
      res.status(500).json({ message: "Failed to fetch archived artworks" });
    }
  });

  // Reactivate archived artwork (admin only)
  app.post("/api/artworks/:id/reactivate", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const artwork = await storage.getArtwork(id);
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }

      if (!artwork.archivedAt) {
        return res.status(400).json({ message: "Artwork is not archived" });
      }

      const reactivated = await storage.reactivateArtwork(id);
      
      // TODO: Re-publish to Shopify when integration is complete
      console.log(`Artwork ${id} reactivated, Shopify re-publish to be implemented`);
      
      res.json(normalizeArtwork(reactivated, req));
    } catch (error: any) {
      console.error("Reactivate artwork error:", error);
      res.status(500).json({ message: error.message || "Failed to reactivate artwork" });
    }
  });

  // Run manual archive check (admin only) - sends warnings and archives eligible artworks
  app.post("/api/archive/check", requireAdmin, async (req, res) => {
    try {
      const { ArchiveService } = await import('./archive-service');
      const { EmailService } = await import('./lib/email-service');
      
      // Create instances with dependencies
      const emailService = new EmailService();
      const archiveService = new ArchiveService(storage, emailService);
      
      // Run the full archive workflow
      const results = await archiveService.runArchiveWorkflow();
      
      res.json({
        message: "Archive check completed",
        warningsSent: results.warningsSent,
        artworksArchived: results.artworksArchived,
        errors: results.errors,
      });
    } catch (error: any) {
      console.error("Archive check error:", error);
      res.status(500).json({ message: error.message || "Failed to run archive check" });
    }
  });

  // Bulk artwork operations (admin only)
  app.post("/api/artworks/bulk", requireAdmin, async (req, res) => {
    try {
      const { artworkIds, action, reason } = req.body;

      if (!artworkIds || !Array.isArray(artworkIds) || artworkIds.length === 0) {
        return res.status(400).json({ message: "artworkIds array is required" });
      }

      if (!action || !["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
      }

      if (action === "reject" && !reason) {
        return res.status(400).json({ message: "reason is required for rejection" });
      }

      let successCount = 0;
      let failureCount = 0;
      const results: Array<{ artworkId: string; success: boolean; error?: string }> = [];

      // Process each artwork
      for (const artworkId of artworkIds) {
        try {
          const artwork = await storage.getArtwork(artworkId);
          if (!artwork) {
            results.push({ artworkId, success: false, error: "Artwork not found" });
            failureCount++;
            continue;
          }

          const artist = await storage.getArtist(artwork.artistId);
          if (!artist) {
            results.push({ artworkId, success: false, error: "Artist not found" });
            failureCount++;
            continue;
          }

          if (action === "approve") {
            // Build absolute image URL for Shopify/Printify
            const publicUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5000';
            
            const imageUrl = artwork.imageUrl.startsWith("http") 
              ? artwork.imageUrl 
              : `${publicUrl}${artwork.imageUrl}`;

            // Update artwork status
            await storage.updateArtwork(artworkId, {
              status: "approved",
            });

            // Create Shopify product (non-blocking)
            if (isShopifyConfigured()) {
              createArtworkProduct({
                title: artwork.title,
                description: artwork.description || "",
                artworkStory: artwork.artworkStory ?? undefined,
                suggestedUse: artwork.suggestedUse ?? undefined,
                styleTags: artwork.styleTags || [],
                imageUrl,
                artistName: artist.name,
                artistShort: artist.artistShort,
                artworkId: artwork.id,
                seoSlug: artwork.seoSlug || artwork.title.toLowerCase().replace(/\s+/g, '-'),
              })
                .then(shopifyProduct => {
                  storage.updateArtwork(artworkId, {
                    shopifyProductId: shopifyProduct.id,
                    shopifyProductStatus: shopifyProduct.status,
                  });
                })
                .catch(err => console.error(`Failed to create Shopify product for artwork ${artworkId}:`, err));
            }

            // Send approval email (non-blocking)
            emailService.sendArtworkDecisionEmail(
              artist.email,
              artist.name,
              artist.id,
              artwork.title,
              true
            ).catch(err => console.error(`Failed to send approval email for artwork ${artworkId}:`, err));

            results.push({ artworkId, success: true });
            successCount++;
          } else {
            // Reject
            await storage.updateArtwork(artworkId, {
              status: "rejected",
              rejectionReason: reason || "No reason provided",
            });

            // Send rejection email (non-blocking)
            emailService.sendArtworkDecisionEmail(
              artist.email,
              artist.name,
              artist.id,
              artwork.title,
              false,
              reason
            ).catch(err => console.error(`Failed to send rejection email for artwork ${artworkId}:`, err));

            results.push({ artworkId, success: true });
            successCount++;
          }
        } catch (error: any) {
          console.error(`Bulk operation failed for artwork ${artworkId}:`, error);
          results.push({ artworkId, success: false, error: error.message });
          failureCount++;
        }
      }

      res.json({
        totalProcessed: artworkIds.length,
        successCount,
        failureCount,
        results,
      });
    } catch (error: any) {
      console.error("Bulk artwork operation error:", error);
      res.status(500).json({ message: error.message || "Failed to process bulk operation" });
    }
  });

  // Deactivate product (artist can deactivate their own products)
  app.post("/api/artworks/:id/deactivate", requireArtist, async (req, res) => {
    try {
      const id = req.params.id as string;
      const artwork = await storage.getArtwork(id);
      
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }

      // Verify artwork belongs to authenticated artist
      if (artwork.artistId !== req.user!.id) {
        return res.status(403).json({ message: "Not authorized to deactivate this artwork" });
      }

      // Only approved artwork with Shopify products can be deactivated
      if (artwork.status !== "approved" || !artwork.shopifyProductId) {
        return res.status(400).json({ message: "Only approved products with Shopify integration can be deactivated" });
      }

      // Update Shopify product status to draft
      if (isShopifyConfigured()) {
        try {
          await updateProductStatus(artwork.shopifyProductId, "draft");
        } catch (error: any) {
          console.error("Failed to update Shopify product status:", error);
          return res.status(500).json({ message: "Failed to deactivate product in Shopify" });
        }
      }

      // Update database
      const updated = await storage.updateArtwork(id, {
        shopifyProductStatus: "draft",
      });

      res.json(normalizeArtwork(updated, req));
    } catch (error: any) {
      console.error("Deactivate artwork error:", error);
      res.status(500).json({ message: error.message || "Failed to deactivate artwork" });
    }
  });

  // Activate product (artist can activate their own products)
  app.post("/api/artworks/:id/activate", requireArtist, async (req, res) => {
    try {
      const id = req.params.id as string;
      const artwork = await storage.getArtwork(id);
      
      if (!artwork) {
        return res.status(404).json({ message: "Artwork not found" });
      }

      // Verify artwork belongs to authenticated artist
      if (artwork.artistId !== req.user!.id) {
        return res.status(403).json({ message: "Not authorized to activate this artwork" });
      }

      // Only approved artwork with Shopify products can be activated
      if (artwork.status !== "approved" || !artwork.shopifyProductId) {
        return res.status(400).json({ message: "Only approved products with Shopify integration can be activated" });
      }

      // Update Shopify product status to active
      if (isShopifyConfigured()) {
        try {
          await updateProductStatus(artwork.shopifyProductId, "active");
        } catch (error: any) {
          console.error("Failed to update Shopify product status:", error);
          return res.status(500).json({ message: "Failed to activate product in Shopify" });
        }
      }

      // Update database
      const updated = await storage.updateArtwork(id, {
        shopifyProductStatus: "active",
      });

      res.json(normalizeArtwork(updated, req));
    } catch (error: any) {
      console.error("Activate artwork error:", error);
      res.status(500).json({ message: error.message || "Failed to activate artwork" });
    }
  });

  // Get artist earnings stats
  app.get("/api/artists/:id/earnings", requireArtist, async (req, res) => {
    try {
      const id = req.params.id as string;
      
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
      const monthlySalesMinor = parseDecimalToMinor(artist.monthlySales || '0');

      // Current and next rung both come from the one ladder. The thresholds
      // used to be spelled out again here, giving a fourth place for them to
      // drift out of agreement with the rate actually paid.
      const currentTier = royaltyPercentForMonthlySales(monthlySalesMinor);

      const ascendingLadder = [...ROYALTY_TIER_LADDER].sort(
        (a, b) => a.minMonthlySalesMinor - b.minMonthlySalesMinor
      );
      const nextRung = ascendingLadder.find(
        (rung) => rung.minMonthlySalesMinor > monthlySalesMinor
      );
      const topRung = ascendingLadder[ascendingLadder.length - 1];

      const nextTierThreshold = (nextRung ?? topRung).minMonthlySalesMinor / 100;
      const nextTierPercentage = (nextRung ?? topRung).percent;

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
      const id = req.params.id as string;
      
      // Verify artist can only access their own referrals
      if (req.session.user?.id !== id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const artist = await storage.getArtist(id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      const sales = await storage.getSalesByArtist(id);

      // Referral-driven sales: the artist drove traffic that converted.
      // Recruitment residuals (earning a cut of another artist's royalties)
      // were removed in Phase 0 step 5 and are no longer reported.
      const referralSales = sales.filter(sale => parseFloat(sale.referralBonus || '0') > 0);
      const totalReferralEarnings = referralSales.reduce((sum, sale) => {
        return sum + parseFloat(sale.referralBonus || '0');
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
            source: recruited.referralSource || 'unknown',
            totalSales,
            totalEarnings,
          };
        })
      );

      // Calculate breakdown by source
      const testimonialRecruits = recruitedArtists.filter(a => a.referralSource === 'testimonial');
      const generalRecruits = recruitedArtists.filter(a => a.referralSource === 'general' || !a.referralSource);

      // Generate referral link
      const shopifyUrl = process.env.SHOPIFY_SHOP_URL || 'your-store.myshopify.com';
      const referralLink = `https://${shopifyUrl}?utm_source=${artist.referralCode}&utm_medium=referral&utm_campaign=artist_network`;

      // Find artist's testimonial if they have one
      const allTestimonials = await storage.getAllTestimonials();
      const artistTestimonial = allTestimonials.find(t => t.artistId === id && t.isActive);
      const testimonialShareUrl = artistTestimonial 
        ? `${process.env.PUBLIC_APP_URL || 'http://localhost:5000'}/success-stories/${artistTestimonial.shareSlug}?utm_source=artist-referral&utm_medium=testimonial&utm_campaign=${artist.referralCode}&ref=${artist.referralCode}`
        : null;

      res.json({
        referralCode: artist.referralCode,
        referralLink,
        testimonialShareUrl,
        stats: {
          totalReferralSales: referralSales.length,
          totalReferralEarnings,
          totalArtistsRecruited: recruitedArtists.length,
          testimonialRecruits: testimonialRecruits.length,
          generalRecruits: generalRecruits.length,
        },
        recruitedArtists: recruitedArtistStats,
      });
    } catch (error: any) {
      console.error("Get referrals error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch referrals" });
    }
  });

  // Get artist artwork performance analytics
  app.get("/api/artists/:id/artwork-performance", requireArtist, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      // Verify artist can only access their own data
      if (req.session.user?.id !== id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const artist = await storage.getArtist(id);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Get all artworks by this artist
      const allArtworks = await storage.getAllArtworks();
      const artistArtworks = allArtworks.filter(a => a.artistId === id);

      // Get all sales for this artist
      const sales = await storage.getSalesByArtist(id);

      // Build performance map for each artwork
      const artworkPerformanceMap = new Map<string, {
        title: string;
        imageUrl: string;
        status: string;
        salesCount: number;
        totalEarnings: number;
        shopifyProductStatus: string | null;
        createdAt: Date | null;
      }>();

      // Initialize map with all artworks
      artistArtworks.forEach(artwork => {
        artworkPerformanceMap.set(artwork.id, {
          title: artwork.title,
          imageUrl: artwork.imageUrl,
          status: artwork.status,
          salesCount: 0,
          totalEarnings: 0,
          shopifyProductStatus: artwork.shopifyProductStatus || null,
          createdAt: artwork.createdAt,
        });
      });

      // Calculate sales and earnings per artwork
      sales.forEach(sale => {
        const performance = artworkPerformanceMap.get(sale.artworkId);
        if (performance) {
          performance.salesCount += 1;
          performance.totalEarnings += parseFloat(sale.totalEarnings || '0');
        }
      });

      // Convert map to sorted array (top performers first)
      const artworkPerformance = Array.from(artworkPerformanceMap.entries())
        .map(([id, data]) => ({
          id,
          ...data,
        }))
        .sort((a, b) => b.totalEarnings - a.totalEarnings);

      // Calculate summary stats
      const approvedArtworks = artistArtworks.filter(a => a.status === 'approved').length;
      const pendingArtworks = artistArtworks.filter(a => a.status === 'pending').length;
      const rejectedArtworks = artistArtworks.filter(a => a.status === 'rejected').length;
      const activeProducts = artistArtworks.filter(a => a.shopifyProductStatus === 'active').length;

      res.json({
        summary: {
          totalArtworks: artistArtworks.length,
          approvedArtworks,
          pendingArtworks,
          rejectedArtworks,
          activeProducts,
        },
        artworks: artworkPerformance,
      });
    } catch (error: any) {
      console.error("Get artwork performance error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch artwork performance" });
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

      // Build artist earnings map
      const artistEarningsMap = new Map<string, {
        totalEarnings: number;
        salesCount: number;
        monthlySales: number;
        referralEarnings: number;
        recruitedCount: number;
      }>();

      // Initialize map for all artists
      allArtists.forEach(artist => {
        artistEarningsMap.set(artist.id, {
          totalEarnings: 0,
          salesCount: 0,
          monthlySales: parseFloat(artist.monthlySales || '0'),
          referralEarnings: 0,
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

            totalRevenue += earnings;
            totalReferralBonuses += referralBonus;

            // Update artist's earnings
            const artistStats = artistEarningsMap.get(sale.artistId);
            if (artistStats) {
              artistStats.totalEarnings += earnings;
              artistStats.salesCount += 1;
              artistStats.referralEarnings += referralBonus;
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
          };
        })
        .filter(a => a !== null && a.recruitedCount > 0)
        .sort((a, b) => (b?.recruitedCount || 0) - (a?.recruitedCount || 0))
        .slice(0, 10);

      const totalRecruitedArtists = allArtists.filter(a => a.referredBy).length;

      res.json({
        totalRevenue,
        totalReferralBonuses,
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
  app.post("/api/admin/payouts/execute", requireAdmin, async (req, res) => {
    try {
      const { periodStart, periodEnd } = req.body;
      
      const start = periodStart ? new Date(periodStart) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const end = periodEnd ? new Date(periodEnd) : new Date();

      const result = await processAllPayouts(start, end);

      res.json({
        message: "Payouts processed",
        successful: result.successful,
        failed: result.failed,
        skipped: result.skipped,
        results: result.results,
      });
    } catch (error: any) {
      console.error("Process payouts error:", error);
      res.status(500).json({ message: error.message || "Failed to process payouts" });
    }
  });

  // Admin: Execute payout for specific artist
  app.post("/api/admin/payouts/execute/:artistId", requireAdmin, async (req, res) => {
    try {
      const artistId = req.params.artistId as string;
      const { periodStart, periodEnd } = req.body;
      
      const start = periodStart ? new Date(periodStart) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const end = periodEnd ? new Date(periodEnd) : new Date();

      const result = await executeArtistPayout(artistId, start, end);

      if (result.success) {
        res.json({
          message: "Payout executed successfully",
          payoutId: result.payoutId,
        });
      } else {
        res.status(400).json({ message: result.error });
      }
    } catch (error: any) {
      console.error("Execute artist payout error:", error);
      res.status(500).json({ message: error.message || "Failed to execute payout" });
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

  // Admin: Get all artists with their unpaid earnings
  app.get("/api/admin/artists/earnings", requireAdmin, async (_req, res) => {
    try {
      const allArtists = await storage.getAllArtists();
      const artists = allArtists.filter(a => a.approved);
      
      // Calculate unpaid earnings for each artist
      const artistsWithEarnings = await Promise.all(
        artists.map(async (artist) => {
          const calculation = await calculateArtistPayout(artist.id);
          const payouts = await storage.getPayoutsByArtist(artist.id);
          const lastPayout = payouts.length > 0 ? payouts[0] : null;
          
          return {
            ...artist,
            unpaidEarnings: calculation ? calculation.totalEarnings : 0,
            unpaidSalesCount: calculation ? calculation.salesCount : 0,
            lastPayoutDate: lastPayout?.createdAt,
            lastPayoutAmount: lastPayout?.amount,
          };
        })
      );
      
      res.json(artistsWithEarnings);
    } catch (error: any) {
      console.error("Get artists earnings error:", error);
      res.status(500).json({ message: "Failed to fetch artist earnings" });
    }
  });

  // Admin: Get payout history with artist details
  app.get("/api/admin/payouts/history", requireAdmin, async (_req, res) => {
    try {
      const payouts = await storage.getAllPayouts();
      
      // Join with artist data
      const payoutsWithArtists = await Promise.all(
        payouts.map(async (payout) => {
          const artist = await storage.getArtist(payout.artistId);
          return {
            ...payout,
            artistName: artist?.name || "Unknown Artist",
            artistEmail: artist?.email || "",
          };
        })
      );
      
      res.json(payoutsWithArtists);
    } catch (error: any) {
      console.error("Get payouts history error:", error);
      res.status(500).json({ message: "Failed to fetch payout history" });
    }
  });

  // Artist: Get payout history for current artist
  app.get("/api/artists/payouts", requireArtist, async (req, res) => {
    try {
      const artist = req.user!;
      const payouts = await storage.getPayoutsByArtist(artist.id);
      
      // Also get current unpaid earnings
      const calculation = await calculateArtistPayout(artist.id);
      
      res.json({
        payouts,
        unpaidEarnings: calculation ? calculation.totalEarnings : 0,
        unpaidSalesCount: calculation ? calculation.salesCount : 0,
      });
    } catch (error: any) {
      console.error("Get artist payouts error:", error);
      res.status(500).json({ message: "Failed to fetch payouts" });
    }
  });

  // ==================== TESTIMONIALS ROUTES ====================
  
  // Public: Get all active testimonials
  app.get("/api/testimonials", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const testimonials = await storage.getActiveTestimonials(limit);
      res.json(testimonials);
    } catch (error: any) {
      console.error("Get testimonials error:", error);
      res.status(500).json({ message: "Failed to fetch testimonials" });
    }
  });

  // Public: Get testimonial by slug with artist referral code for affiliate links
  app.get("/api/testimonials/:slug", async (req, res) => {
    try {
      const testimonial = await storage.getTestimonialBySlugWithArtist(req.params.slug as string);
      if (!testimonial) {
        return res.status(404).json({ message: "Testimonial not found" });
      }
      if (!testimonial.isActive) {
        return res.status(404).json({ message: "Testimonial not available" });
      }
      res.json(testimonial);
    } catch (error: any) {
      console.error("Get testimonial by slug error:", error);
      res.status(500).json({ message: "Failed to fetch testimonial" });
    }
  });

  // Public: Get featured testimonials with tier-based sorting for homepage
  app.get("/api/featured-testimonials", async (_req, res) => {
    try {
      const testimonials = await storage.getFeaturedTestimonialsWithArtist();
      res.json(testimonials);
    } catch (error: any) {
      console.error("Get featured testimonials error:", error);
      res.status(500).json({ message: "Failed to fetch featured testimonials" });
    }
  });

  // Admin: Get all testimonials (including inactive) with artist referral codes
  app.get("/api/admin/testimonials", requireAdmin, async (_req, res) => {
    try {
      const testimonials = await storage.getAllTestimonialsWithArtist();
      res.json(testimonials);
    } catch (error: any) {
      console.error("Get all testimonials error:", error);
      res.status(500).json({ message: "Failed to fetch testimonials" });
    }
  });

  // Admin: Create testimonial
  app.post("/api/admin/testimonials", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertTestimonialSchema.parse(req.body);
      
      // Generate unique share slug if not provided
      if (!validatedData.shareSlug) {
        const slugBase = validatedData.artistName.toLowerCase().replace(/\s+/g, '-');
        validatedData.shareSlug = `${slugBase}-${Date.now()}`;
      }
      
      // Capture consent metadata for legal audit trail
      const testimonialData = {
        ...validatedData,
        consentTimestamp: validatedData.artistConsent ? new Date() : null,
        consentVersion: validatedData.artistConsent ? "v1.0-2025" : null, // Version of consent language
        approvedByAdminId: req.session.adminId, // Track which admin approved this
      };
      
      const testimonial = await storage.createTestimonial(testimonialData);
      res.status(201).json(testimonial);
    } catch (error: any) {
      console.error("Create testimonial error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create testimonial" });
    }
  });

  // Admin: Update testimonial
  app.patch("/api/admin/testimonials/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const updates = req.body;
      
      const testimonial = await storage.updateTestimonial(id, updates);
      res.json(testimonial);
    } catch (error: any) {
      console.error("Update testimonial error:", error);
      if (error.message === "Testimonial not found") {
        return res.status(404).json({ message: "Testimonial not found" });
      }
      res.status(500).json({ message: "Failed to update testimonial" });
    }
  });

  // Admin: Delete testimonial
  app.delete("/api/admin/testimonials/:id", requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      await storage.deleteTestimonial(id);
      res.json({ message: "Testimonial deleted successfully" });
    } catch (error: any) {
      console.error("Delete testimonial error:", error);
      res.status(500).json({ message: "Failed to delete testimonial" });
    }
  });

  // Admin: Reorder testimonials
  app.post("/api/admin/testimonials/reorder", requireAdmin, async (req, res) => {
    try {
      const { reorderedItems } = req.body;
      
      if (!Array.isArray(reorderedItems)) {
        return res.status(400).json({ message: "reorderedItems must be an array" });
      }
      
      await storage.reorderTestimonials(reorderedItems);
      res.json({ message: "Testimonials reordered successfully" });
    } catch (error: any) {
      console.error("Reorder testimonials error:", error);
      res.status(500).json({ message: "Failed to reorder testimonials" });
    }
  });

  // ============================================
  // FINANCIAL ANALYTICS & TOOLS (Admin Only)
  // ============================================

  // Get comprehensive revenue metrics across all streams
  app.get("/api/admin/financial/revenue", requireAdmin, async (req, res) => {
    try {
      const { calculateRevenueMetrics } = await import('./lib/financial-service');
      const metrics = await calculateRevenueMetrics();
      res.json(metrics);
    } catch (error: any) {
      console.error("Revenue metrics error:", error);
      res.status(500).json({ message: "Failed to calculate revenue metrics" });
    }
  });

  // Calculate product margins for different scenarios
  app.post("/api/admin/financial/margins", requireAdmin, async (req, res) => {
    try {
      const { calculateProductMargin, isValidRoyaltyTier } = await import('./lib/financial-service');
      const { retailPrice, printifyCost, shipping, artistRoyaltyPercent } = req.body;

      if (!retailPrice || !printifyCost || !shipping || !artistRoyaltyPercent) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // ENFORCE: Royalty must be 30%, 35%, or 45% (replit.md policy)
      if (!isValidRoyaltyTier(artistRoyaltyPercent)) {
        return res.status(400).json({ 
          message: `Invalid royalty percentage. Must be 30%, 35%, or 45% per replit.md policy. Received: ${artistRoyaltyPercent}%`
        });
      }

      const margin = calculateProductMargin(
        retailPrice,
        printifyCost,
        shipping,
        artistRoyaltyPercent
      );

      res.json(margin);
    } catch (error: any) {
      console.error("Margin calculation error:", error);
      res.status(500).json({ message: error.message || "Failed to calculate margins" });
    }
  });

  // Generate pricing strategy recommendations
  app.post("/api/admin/financial/pricing-strategy", requireAdmin, async (req, res) => {
    try {
      const { generatePricingStrategy } = await import('./lib/financial-service');
      const { productType, currentPrice, printifyCost, shipping } = req.body;

      if (!productType || !currentPrice || !printifyCost || !shipping) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      const strategy = await generatePricingStrategy(
        productType,
        currentPrice,
        printifyCost,
        shipping
      );

      res.json(strategy);
    } catch (error: any) {
      console.error("Pricing strategy error:", error);
      res.status(500).json({ message: "Failed to generate pricing strategy" });
    }
  });

  // Product costs, resolved through the same path the payout uses.
  // Each row reports its own `source`, so an admin can tell live Printify
  // pricing from fixture values at a glance rather than being shown a number
  // with no provenance.
  app.get("/api/admin/financial/printify-costs", requireAdmin, async (_req, res) => {
    try {
      const { getResolvedProductCosts } = await import('./lib/financial-service');
      res.json({ costs: await getResolvedProductCosts() });
    } catch (error: any) {
      console.error("Printify costs error:", error);
      res.status(500).json({ message: "Failed to resolve product costs" });
    }
  });

  // ===== ADMIN TOOLS: CREDIT MANAGEMENT & TIER OVERRIDES =====

  // Admin: Reset artist's upscale credits to max for their current tier
  app.post("/api/admin/reset-credits", requireAdmin, async (req, res) => {
    try {
      const { email, notes } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Artist email is required" });
      }

      // Find artist by email
      const artist = await storage.getArtistByEmail(email);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found with that email" });
      }

      // Reset monthly upscales to 0 (gives them full quota back)
      await storage.updateArtist(artist.id, {
        monthlyUpscalesUsed: 0,
        lastUpscaleResetAt: new Date(),
      });

      // Log the admin action
      const admin = req.user!;
      await db.insert(adminActions).values({
        adminId: admin.id,
        adminEmail: admin.email,
        actionType: "reset_credits",
        targetType: "artist",
        targetId: artist.id,
        targetEmail: artist.email,
        details: {
          previousUsed: artist.monthlyUpscalesUsed,
          resetTo: 0,
        },
        notes: notes || "Admin reset upscale credits",
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        message: `Credits reset for ${artist.name} (${artist.email})`,
        artist: {
          id: artist.id,
          name: artist.name,
          email: artist.email,
          previousUsed: artist.monthlyUpscalesUsed,
          newQuota: (await import('./lib/upscale-quota-service')).UpscaleQuotaService.QUOTAS.monthly,
        },
      });
    } catch (error: any) {
      console.error("Reset credits error:", error);
      res.status(500).json({ message: error.message || "Failed to reset credits" });
    }
  });

  // Get AI upscale usage analytics
  app.get("/api/admin/analytics/upscales", requireAdmin, async (req, res) => {
    try {
      const usage = await storage.getAllUpscaleUsage();
      
      // Normalize data: ensure tier, quotaType, costCents have valid defaults
      const normalized = usage.map(u => ({
        ...u,
        quotaType: u.quotaType || 'monthly',
        costCents: u.costCents || 0,
        status: u.status || 'queued',
      }));
      
      // Calculate total metrics
      const totalUpscales = normalized.length;
      const completedUpscales = normalized.filter(u => u.status === 'completed').length;
      const failedUpscales = normalized.filter(u => u.status === 'failed').length;
      const totalCostCents = normalized.reduce((sum, u) => sum + u.costCents, 0);
      const totalCostDollars = totalCostCents / 100;
      
      // Breakdown by quota type (with null guard)
      const byQuotaType = {
        registration_bonus: normalized.filter(u => u.quotaType === 'registration_bonus').length,
        monthly: normalized.filter(u => u.quotaType === 'monthly').length,
      };

      // Cache hit analysis (upscales with no jobId means cache hit)
      const cacheHits = normalized.filter(u => !u.jobId && u.status === 'completed').length;
      const cacheHitRate = totalUpscales > 0 ? (cacheHits / totalUpscales * 100) : 0;

      res.json({
        totalUpscales,
        completedUpscales,
        failedUpscales,
        totalCostDollars: parseFloat(totalCostDollars.toFixed(2)),
        byQuotaType,
        cacheHits,
        cacheHitRate: parseFloat(cacheHitRate.toFixed(1)),
      });
    } catch (error: any) {
      console.error("Upscale analytics error:", error);
      res.status(500).json({ message: "Failed to calculate upscale analytics" });
    }
  });

  // ============================================
  // AI IMAGE UPSCALING ROUTES
  // ============================================
  
  app.post("/api/upscale/analyze", async (req, res) => {
    try {
      const artistId = req.session.user?.id;
      if (!artistId || req.session.user?.type !== "artist") {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { imageUrl, width, height } = req.body;

      if (!imageUrl || !width || !height) {
        return res.status(400).json({ message: "Image URL, width, and height are required" });
      }

      const { DpiValidatorService } = await import('./lib/dpi-validator-service');
      const { UpscaleQuotaService } = await import('./lib/upscale-quota-service');

      const analysis = DpiValidatorService.analyzePrintQuality(width, height);
      const quotaStatus = await UpscaleQuotaService.checkQuota(artistId);

      const recommendedScale = DpiValidatorService.getUpscaleScale(width, height);
      const shouldRecommend = DpiValidatorService.shouldRecommendUpscaling(width, height);
      
      // Only calculate upscaled quality if upscaling is safe
      const upscaledAnalysis = recommendedScale !== null
        ? DpiValidatorService.calculateUpscaledQuality(width, height, recommendedScale)
        : null;

      res.json({
        current: analysis,
        afterUpscaling: upscaledAnalysis,
        quota: quotaStatus,
        shouldRecommend,
        recommendedScale
      });
    } catch (error: any) {
      console.error("Upscale analysis error:", error);
      res.status(500).json({ message: "Failed to analyze image" });
    }
  });

  app.post("/api/upscale/request", async (req, res) => {
    try {
      const artistId = req.session.user?.id;
      if (!artistId || req.session.user?.type !== "artist") {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { imageUrl, fileHash, width, height, fileSize } = req.body;

      if (!imageUrl || !fileHash || !width || !height || !fileSize) {
        const { UpscaleErrorCode } = await import('./lib/replicate-upscale-service');
        return res.status(400).json({ 
          status: 'error',
          code: UpscaleErrorCode.INVALID_IMAGE,
          userMessage: "Invalid image data. Please try uploading your image again.",
          developerMessage: "Image URL, file hash, dimensions, and file size are required"
        });
      }

      const { UpscaleQuotaService } = await import('./lib/upscale-quota-service');
      const { UpscaleDeduplicationService } = await import('./lib/upscale-deduplication-service');
      const { UpscaleAbuseProtection } = await import('./lib/upscale-abuse-protection');
      const { ReplicateUpscaleService } = await import('./lib/replicate-upscale-service');
      const { DpiValidatorService } = await import('./lib/dpi-validator-service');

      const artist = await storage.getArtistById(artistId);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found" });
      }

      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() 
        || req.socket.remoteAddress 
        || 'unknown';

      const abuseCheck = await UpscaleAbuseProtection.checkAllProtections({
        artistId,
        ipAddress,
        fileSize,
        accountCreatedAt: artist.createdAt
      });

      if (!abuseCheck.allowed) {
        return res.status(429).json({ 
          message: abuseCheck.reason,
          waitSeconds: abuseCheck.waitSeconds
        });
      }

      const quotaStatus = await UpscaleQuotaService.checkQuota(artistId);
      if (!quotaStatus.hasQuota) {
        return res.status(403).json({ 
          message: "Upscale quota exceeded",
          quota: quotaStatus
        });
      }

      const cached = await UpscaleDeduplicationService.checkCache(fileHash);
      if (cached.found) {
        console.log(`âœ… Upscale cache hit for hash ${fileHash} - returning cached result WITHOUT consuming quota`);
        
        // DO NOT consume quota for cached results - deduplication should be free!
        // await UpscaleQuotaService.consumeQuota(artistId, quotaStatus.quotaType);
        
        await UpscaleDeduplicationService.saveToCache({
          fileHash,
          artistId,
          quotaType: quotaStatus.quotaType,
          tier: UPSCALE_TIER_SNAPSHOT,
          ipAddress,
          originalUrl: imageUrl,
          upscaledUrl: cached.upscaledUrl!,
          originalWidth: cached.originalWidth!,
          originalHeight: cached.originalHeight!,
          upscaledWidth: cached.upscaledWidth!,
          upscaledHeight: cached.upscaledHeight!,
          originalDpi: cached.originalDpi!,
          costCents: 0
        });
        
        return res.json({
          status: 'completed',
          upscaledUrl: cached.upscaledUrl,
          cached: true,
          originalWidth: cached.originalWidth,
          originalHeight: cached.originalHeight,
          upscaledWidth: cached.upscaledWidth,
          upscaledHeight: cached.upscaledHeight
        });
      }

      // Convert local path to publicly accessible URL for Replicate
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers.host;
      const publicImageUrl = imageUrl.startsWith('http') 
        ? imageUrl 
        : `${protocol}://${host}${imageUrl}`;

      try {
        // createUpscaleJob now automatically calculates optimal scale
        const { predictionId, scale } = await ReplicateUpscaleService.createUpscaleJob({
          imageUrl: publicImageUrl,
          width,
          height
        });
        
        const estimatedCost = ReplicateUpscaleService.estimateCost(scale);
        console.log(`Upscale job created with intelligent scale: ${scale}`);

        const priority = UPSCALE_JOB_PRIORITY;

        const job = await storage.createUpscaleJob({
          artistId,
          fileHash,
          originalUrl: imageUrl,
          status: 'queued',
          priority,
          replicateId: predictionId
        });

        await UpscaleQuotaService.consumeQuota(artistId, quotaStatus.quotaType);

        await UpscaleDeduplicationService.createPendingRecord({
          fileHash,
          artistId,
          quotaType: quotaStatus.quotaType,
          tier: UPSCALE_TIER_SNAPSHOT,
          ipAddress,
          jobId: job.id,
          replicateId: predictionId,
          originalUrl: imageUrl,
          originalWidth: width,
          originalHeight: height,
          upscaledWidth: width * scale,
          upscaledHeight: height * scale,
          originalDpi: DpiValidatorService.analyzePrintQuality(width, height).estimatedDpi,
          costCents: estimatedCost
        });

        console.log(`âœ… Upscale job created: ${job.id} (Replicate: ${predictionId})`);

        res.json({
          status: 'queued',
          jobId: job.id,
          predictionId,
          estimatedCost: estimatedCost,
          message: 'Upscaling in progress. This usually takes 30-60 seconds.'
        });
      } catch (error: any) {
        console.error("Upscale request error:", error);
        
        // Extract user-friendly error message if available
        const { UpscaleError, UpscaleErrorCode } = await import('./lib/replicate-upscale-service');
        const isUpscaleError = error.name === 'UpscaleError';
        const userMessage = isUpscaleError ? error.userMessage : "The AI upscaling service is temporarily unavailable. Please try again in a moment.";
        const errorCode = isUpscaleError ? error.code : UpscaleErrorCode.UNKNOWN_ERROR;
        const devMessage = error.message || "Failed to create upscale job";
        
        await UpscaleDeduplicationService.recordFailedAttempt({
          fileHash,
          artistId,
          quotaType: quotaStatus.quotaType,
          tier: UPSCALE_TIER_SNAPSHOT,
          ipAddress,
          originalUrl: imageUrl,
          errorMessage: devMessage
        });

        // Use 400 for client errors (IMAGE_TOO_LARGE), 500 for server errors
        const statusCode = errorCode === UpscaleErrorCode.IMAGE_TOO_LARGE ? 400 : 500;
        
        res.status(statusCode).json({ 
          status: 'error',
          code: errorCode,
          userMessage,
          developerMessage: devMessage
        });
      }
    } catch (error: any) {
      console.error("Upscale request error (outer):", error);
      
      // Maintain consistent error response format even for unexpected errors
      const { UpscaleErrorCode } = await import('./lib/replicate-upscale-service');
      res.status(500).json({ 
        status: 'error',
        code: UpscaleErrorCode.UNKNOWN_ERROR,
        userMessage: "An unexpected error occurred. Please try again in a moment.",
        developerMessage: error.message || "Failed to process upscale request"
      });
    }
  });

  app.get("/api/upscale/status/:jobId", async (req, res) => {
    try {
      const artistId = req.session.user?.id;
      if (!artistId || req.session.user?.type !== "artist") {
        return res.status(401).json({ message: "Authentication required" });
      }

      const jobId = req.params.jobId as string;

      const job = await storage.getUpscaleJobById(jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.artistId !== artistId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (job.status === 'completed' && job.upscaledUrl) {
        return res.json({
          status: 'completed',
          upscaledUrl: job.upscaledUrl,
          jobId: job.id
        });
      }

      if (job.status === 'failed') {
        return res.json({
          status: 'failed',
          error: job.errorMessage || "Upscaling failed",
          jobId: job.id
        });
      }

      if (job.replicateId) {
        const { ReplicateUpscaleService } = await import('./lib/replicate-upscale-service');
        
        try {
          const replicateStatus = await ReplicateUpscaleService.getJobStatus(job.replicateId);
          
          if (replicateStatus.status === 'completed' && replicateStatus.upscaledUrl) {
            // Validate required data exists
            if (!job.fileHash) {
              console.error('Missing fileHash for upscale job:', job.id);
              await storage.updateUpscaleJob(job.id, {
                status: 'failed',
                errorMessage: 'Internal error: missing file hash'
              });
              await storage.updateUpscaleUsageByJobId(job.id, {
                status: 'failed',
                errorMessage: 'Internal error: missing file hash'
              });
              return res.json({
                status: 'failed',
                error: 'Internal error occurred. Please try upscaling again.',
                userMessage: 'Something went wrong saving your upscaled image. Please try again.',
                jobId: job.id
              });
            }

            // Download and save upscaled image to object storage
            let permanentUrl: string;
            try {
              permanentUrl = await ReplicateUpscaleService.saveUpscaledImageToStorage(
                replicateStatus.upscaledUrl,
                artistId,
                job.fileHash
              );
            } catch (saveError: any) {
              console.error('Failed to save upscaled image to storage:', saveError);
              // Mark job as failed if we can't save to permanent storage
              const errorMessage = 'Failed to save upscaled image to storage';
              await storage.updateUpscaleJob(job.id, {
                status: 'failed',
                errorMessage
              });
              await storage.updateUpscaleUsageByJobId(job.id, {
                status: 'failed',
                errorMessage
              });
              return res.json({
                status: 'failed',
                error: errorMessage,
                userMessage: 'Failed to save your upscaled image. Please try again.',
                jobId: job.id
              });
            }

            await storage.updateUpscaleJob(job.id, {
              status: 'completed',
              upscaledUrl: permanentUrl,
              completedAt: new Date()
            });

            await storage.updateUpscaleUsageByJobId(job.id, {
              status: 'completed',
              upscaledUrl: permanentUrl,
              completedAt: new Date()
            });

            return res.json({
              status: 'completed',
              upscaledUrl: permanentUrl,
              jobId: job.id
            });
          } else if (replicateStatus.status === 'failed') {
            // Use user-friendly error message if available
            const userMessage = replicateStatus.userMessage || "The AI upscaling service encountered an error. Please try again.";
            const devError = replicateStatus.error || "Upscaling failed";
            const errorCode = replicateStatus.errorCode;
            
            await storage.updateUpscaleJob(job.id, {
              status: 'failed',
              errorMessage: devError
            });

            await storage.updateUpscaleUsageByJobId(job.id, {
              status: 'failed',
              errorMessage: devError
            });

            return res.json({
              status: 'failed',
              code: errorCode,
              userMessage,
              jobId: job.id
            });
          }

          return res.json({
            status: replicateStatus.status,
            jobId: job.id
          });
        } catch (error: any) {
          console.error("Error checking Replicate status:", error);
          return res.json({
            status: job.status,
            jobId: job.id
          });
        }
      }

      res.json({
        status: job.status,
        jobId: job.id
      });
    } catch (error: any) {
      console.error("Status check error:", error);
      res.status(500).json({ message: "Failed to check status" });
    }
  });

  app.get("/api/upscale/quota", async (req, res) => {
    try {
      const artistId = req.session.user?.id;
      if (!artistId || req.session.user?.type !== "artist") {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { UpscaleQuotaService } = await import('./lib/upscale-quota-service');
      
      const quotaStatus = await UpscaleQuotaService.checkQuota(artistId);
      const analytics = await UpscaleQuotaService.getUsageAnalytics(artistId);

      res.json({
        ...quotaStatus,
        analytics
      });
    } catch (error: any) {
      console.error("Quota check error:", error);
      res.status(500).json({ message: "Failed to check quota" });
    }
  });
  
  // ========================================
  // COMING SOON PAGE ROUTES (PUBLIC)
  // ========================================
  
  // Unlock coming soon page with password
  app.post("/api/coming-soon/unlock", async (req, res) => {
    try {
      const { password } = req.body;
      
      // Simple password check - can be enhanced with env variable
      const validPasswords = ["247tester", "printtester"];
      
      if (validPasswords.includes(password)) {
        // Set a signed cookie to mark as unlocked
        req.session.comingSoonUnlocked = true;
        await new Promise<void>((resolve, reject) => {
          req.session.save((err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        return res.json({ success: true, message: "Access granted" });
      } else {
        return res.status(401).json({ success: false, message: "Invalid password" });
      }
    } catch (error: any) {
      console.error("Unlock error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });
  
  // Check unlock status
  app.get("/api/coming-soon/status", async (req, res) => {
    res.json({ unlocked: !!req.session.comingSoonUnlocked });
  });
  
  // Join waitlist (public endpoint)
  const waitlistLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 submissions per IP
    message: "Too many waitlist submissions. Please try again later.",
  });
  
  app.post("/api/waitlist", waitlistLimiter, async (req, res) => {
    try {
      const { insertWaitlistSchema } = await import("@shared/schema");
      const data = insertWaitlistSchema.parse(req.body);
      
      // Check if email already exists
      const existingEntries = await storage.getAllWaitlistEntries();
      if (existingEntries.some(entry => entry.email === data.email)) {
        return res.status(400).json({ message: "This email is already on the waitlist" });
      }
      
      const entry = await storage.createWaitlistEntry(data);
      
      // Send notification email to admin (best-effort)
      try {
        await emailService.sendWaitlistNotification({
          email: entry.email,
          name: entry.name,
          interest: entry.interest,
        });
      } catch (emailError) {
        console.error("Failed to send waitlist notification:", emailError);
        // Don't fail the request if email fails
      }
      
      res.json({ 
        success: true,
        message: "Successfully joined the waitlist!",
        entry: { id: entry.id, email: entry.email, name: entry.name }
      });
    } catch (error: any) {
      console.error("Waitlist signup error:", error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to join waitlist" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

