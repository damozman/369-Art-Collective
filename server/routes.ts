import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
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
} from "@shared/schema";
import { db } from "./lib/db";
import crypto from "crypto";
import { createDraftProduct, createArtworkProduct, isShopifyConfigured, updateProductStatus } from "./lib/shopify";
import { createWallArtProducts } from "./lib/printify-service";
import { isPrintifyConfigured } from "./lib/printify";
import { syncPrintifyMockupsWithRetry } from "./lib/printify-mockup-sync";
import { requireAuth, requireArtist, requireAdmin, requireInfluencer } from "./middleware/auth";
import { getAffiliateCodeFromCookie } from "./middleware/affiliate-tracking";
import { processShopifyOrder } from "./lib/order-processor";
import { processCreatorStackPurchase } from "./lib/creatorstack-webhook-processor";
import { verifyShopifyWebhook } from "./lib/shopify-webhook-security";
import { validateImageQuality, validateImageQualityFromBuffer, getImageDimensions, MIN_LONG_SIDE, MIN_SHORT_SIDE } from "./lib/image-validator";
import { stripeConnectService } from "./lib/stripe-connect";
import { executeArtistPayout, processAllPayouts, calculateArtistPayout } from "./lib/payout-service";
import { emailService } from "./lib/email-service";
import { generateReferralCode } from "./lib/referral-code-generator";
import { AchievementService } from "./achievement-service";
import { generateAiImage, saveAiImage, validatePrompt, generateArtworkContent } from "./ai-service";
import { subscriptionService } from "./lib/subscription-service";
import Stripe from "stripe";

// Initialize achievement service
const achievementService = new AchievementService(storage);

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads (using memory storage for object storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit to accommodate upscaled images
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG and JPG files are allowed"));
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

    // Check OpenAI
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        health.services.openai = { status: "not_configured" };
      } else {
        health.services.openai = { status: "configured" };
      }
    } catch (error: any) {
      health.services.openai = { status: "error", message: error.message };
    }

    // Check Email Service (Resend)
    try {
      if (!process.env.REPLIT_CONNECTORS_HOSTNAME) {
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
        console.error("❌ Raw body not available for Stripe signature verification");
        return res.status(500).send('Server configuration error');
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error("❌ STRIPE_WEBHOOK_SECRET not configured");
        return res.status(500).send('Webhook secret not configured');
      }

      let event;
      try {
        event = stripeConnectService.verifyWebhookSignature(
          req.rawBody,
          signature as string,
          webhookSecret
        );
        console.log(`✅ Stripe webhook verified: ${event.type}`);
      } catch (err: any) {
        console.warn(`⚠️ Stripe webhook signature verification failed: ${err.message}`);
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
          
          console.log(`✅ Updated Stripe status for artist ${artistId}`);
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
            console.log(`✅ Marked payout ${payoutId} as paid`);
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
          console.log(`✅ Marked payout ${payoutId} as failed`);
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
          console.log(`✅ Marked payout ${payoutId} as paid (via payout.paid event)`);
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
          console.log(`✅ Marked payout ${payoutId} as failed (via payout.failed event)`);
        }
      } else if (eventType === 'checkout.session.completed') {
        // Handle successful Stripe Checkout session for featured subscriptions
        const session = event.data.object as any;
        const subscriptionType = session.metadata?.subscriptionType;
        
        if (subscriptionType === 'premium_featured') {
          const { artistId, testimonialId } = session.metadata;
          const stripeSubscriptionId = session.subscription as string;
          
          if (!artistId || !testimonialId || !stripeSubscriptionId) {
            console.warn('Checkout session completed without required metadata');
          } else {
            // Idempotency: Check if subscription already exists
            const existingSubs = await storage.getFeaturedSlotsByTier('premium');
            const existingSubscription = existingSubs.find(
              (sub) => sub.stripeSubscriptionId === stripeSubscriptionId
            );
            
            if (existingSubscription) {
              console.log(`⚠️ Subscription ${stripeSubscriptionId} already exists (webhook retry), skipping creation`);
            } else {
              console.log(`Creating premium featured subscription for artist ${artistId}, testimonial ${testimonialId}`);
              
              // Calculate subscription period (30 days from now)
              const now = new Date();
              const expiresAt = new Date(now);
              expiresAt.setDate(expiresAt.getDate() + 30);
              
              // Create featured subscription record
              await storage.createFeaturedSubscription({
                artistId,
                testimonialId,
                featuredTier: 'premium',
                startDate: now,
                expiresAt,
                tierPriority: 2, // Premium tier
                stripeSubscriptionId,
                subscriptionStatus: 'active',
                currentPeriodEnd: expiresAt,
              });
              
              // Update testimonial to mark as featured
              await storage.updateTestimonial(testimonialId, { featured: true });
              
              console.log(`✅ Created premium featured subscription for testimonial ${testimonialId}`);
            }
          }
        }
      } else if (eventType === 'invoice.paid') {
        // Handle successful subscription renewal and payment recovery
        const invoice = event.data.object as any;
        const stripeSubscriptionId = invoice.subscription as string;
        
        if (stripeSubscriptionId) {
          // Find subscription by Stripe ID
          const subscriptions = await storage.getFeaturedSlotsByTier('premium');
          const subscription = subscriptions.find(
            (sub) => sub.stripeSubscriptionId === stripeSubscriptionId && !sub.endDate
          );
          
          if (subscription) {
            console.log(`Renewing subscription ${subscription.id} for 30 days`);
            
            // Extend subscription by 30 days
            const newExpiresAt = new Date();
            newExpiresAt.setDate(newExpiresAt.getDate() + 30);
            
            await storage.updateFeaturedSubscription(subscription.id, {
              expiresAt: newExpiresAt,
              currentPeriodEnd: newExpiresAt,
              subscriptionStatus: 'active',
            });
            
            // Re-feature testimonial (in case it was unfeatured due to payment failure)
            await storage.updateTestimonial(subscription.testimonialId, { featured: true });
            
            console.log(`✅ Renewed subscription ${subscription.id} until ${newExpiresAt.toISOString()} and re-featured testimonial`);
          }
        }
      } else if (eventType === 'customer.subscription.updated') {
        // Handle subscription status changes
        const subscription = event.data.object as any;
        const stripeSubscriptionId = subscription.id;
        const newStatus = subscription.status; // active, past_due, canceled, etc.
        
        // Find our subscription record
        const subscriptions = await storage.getFeaturedSlotsByTier('premium');
        const ourSubscription = subscriptions.find(
          (sub) => sub.stripeSubscriptionId === stripeSubscriptionId && !sub.endDate
        );
        
        if (ourSubscription) {
          console.log(`Updating subscription ${ourSubscription.id} status to ${newStatus}`);
          
          await storage.updateFeaturedSubscription(ourSubscription.id, {
            subscriptionStatus: newStatus,
          });
          
          // Update featured status based on subscription status
          if (newStatus === 'active') {
            // Re-feature testimonial when subscription returns to active
            await storage.updateTestimonial(ourSubscription.testimonialId, { featured: true });
            console.log(`✅ Re-featured testimonial ${ourSubscription.testimonialId} - subscription now active`);
          } else if (newStatus === 'canceled' || newStatus === 'unpaid') {
            // Unfeature testimonial for canceled or unpaid subscriptions
            await storage.updateTestimonial(ourSubscription.testimonialId, { featured: false });
            console.log(`⚠️ Unfeatured testimonial ${ourSubscription.testimonialId} due to subscription status: ${newStatus}`);
          }
          
          console.log(`✅ Updated subscription ${ourSubscription.id} status to ${newStatus}`);
        }
      } else if (eventType === 'customer.subscription.deleted') {
        // Handle subscription cancellation/deletion
        const subscription = event.data.object as any;
        const stripeSubscriptionId = subscription.id;
        
        // Find and end the subscription
        const subscriptions = await storage.getFeaturedSlotsByTier('premium');
        const ourSubscription = subscriptions.find(
          (sub) => sub.stripeSubscriptionId === stripeSubscriptionId && !sub.endDate
        );
        
        if (ourSubscription) {
          console.log(`Ending subscription ${ourSubscription.id}`);
          
          const now = new Date();
          await storage.updateFeaturedSubscription(ourSubscription.id, {
            endDate: now,
            subscriptionStatus: 'canceled',
            endReason: 'customer_canceled',
          });
          
          // Unfeature the testimonial
          await storage.updateTestimonial(ourSubscription.testimonialId, { featured: false });
          
          // Log the change
          await storage.logFeaturedRotation({
            rotationDate: now,
            testimonialId: ourSubscription.testimonialId,
            artistId: ourSubscription.artistId,
            featuredTier: 'premium',
            artistEarnings: '0',
            action: 'removed',
            reason: 'Subscription canceled by customer',
          });
          
          console.log(`✅ Ended subscription ${ourSubscription.id} and unfeatured testimonial ${ourSubscription.testimonialId}`);
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
              challengeBonus: "0",
              totalPayout: null,
            });
            console.log(`Affiliate conversion tracked: Artist ${artist.id} via influencer ${influencer.id}`);
            
            // Check for achievement unlocks
            await achievementService.onConversionCreated(influencer.id);
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

        const { password, ...artistData } = artist;
        res.status(201).json(artistData);
      });
    } catch (error: any) {
      console.error("Artist registration error:", error);
      res.status(400).json({ message: error.message || "Registration failed" });
    }
  });

  // Atomic registration endpoint - creates account + uploads portfolio + sets tier in one transaction
  app.post("/api/artists/register-complete", upload.array("portfolioFiles", 3), async (req, res) => {
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

      // Validate each image's quality
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
      }

      // Validate account data
      const accountData = insertArtistSchema.parse({
        email: req.body.email,
        password: req.body.password,
        name: req.body.name,
        artistShort: req.body.artistShort,
      });

      // Check if email already exists
      const existing = await storage.getArtistByEmail(accountData.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Parse tier selection
      const selectedTier = req.body.tier as "free" | "pro" | "elite";
      if (!["free", "pro", "elite"].includes(selectedTier)) {
        return res.status(400).json({ message: "Invalid subscription tier" });
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

      // Execute atomic transaction: create artist + upload portfolio
      const result = await db.transaction(async (tx) => {
        // 1. Create artist account
        const [artist] = await tx
          .insert(storage.getArtistsTable())
          .values({
            ...accountData,
            password: hashedPassword,
            referredBy,
            referralSource,
            tosAcceptedAt: new Date(),
            tosIpAddress: ipAddress,
            tosVersion: "v1.0-2025-11",
          } as any)
          .returning();

        // 2. Upload portfolio files to object storage and create records
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
          
          const [submission] = await tx
            .insert(storage.getPortfolioSubmissionsTable())
            .values({
              artistId: artist.id,
              imageUrl,
            } as any)
            .returning();
          portfolioSubmissions.push(submission);
        }

        console.log(`[Atomic Registration] Artist ${artist.id} created with ${portfolioSubmissions.length} portfolio images`);
        
        return { artist, portfolioSubmissions };
      });

      const { artist, portfolioSubmissions } = result;

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
              challengeBonus: "0",
              totalPayout: null,
            });
            console.log(`Affiliate conversion tracked: Artist ${artist.id} via influencer ${influencer.id}`);
            await achievementService.onConversionCreated(influencer.id);
          }
        } catch (err) {
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

        const { password, ...artistData } = artist;
        res.status(201).json({
          ...artistData,
          portfolioCount: portfolioSubmissions.length,
          tier: selectedTier,
        });
      });
    } catch (error: any) {
      console.error("Atomic registration error:", error);
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

  // ===== SUBSCRIPTION ROUTES (must come before :id routes) =====

  // Get current subscription details
  app.get("/api/artists/subscription", subscriptionReadLimiter, requireArtist, async (req, res) => {
    try {
      const artist = req.user!;
      const details = await subscriptionService.getSubscriptionDetails(artist.id);
      res.json(details);
    } catch (error: any) {
      console.error(`[ERROR][SUBSCRIPTION_GET_FAILED] artistId=${req.user?.id}`, error);
      res.status(500).json({ message: "Failed to get subscription details" });
    }
  });

  // Create new subscription (Pro or Elite)
  app.post("/api/artists/subscription/create", subscriptionMutationLimiter, requireArtist, async (req, res) => {
    const startTime = Date.now();
    const artist = req.user!;
    const { tier, idempotencyKey } = req.body;
    
    try {
      if (tier !== 'pro' && tier !== 'elite') {
        return res.status(400).json({ message: "Invalid tier. Must be 'pro' or 'elite'" });
      }

      if (!idempotencyKey || typeof idempotencyKey !== 'string') {
        return res.status(400).json({ message: "Idempotency key is required" });
      }

      const result = await subscriptionService.createSubscription(
        artist.id,
        tier,
        artist.email,
        artist.name,
        idempotencyKey
      );

      const duration = Date.now() - startTime;
      console.log(`[SUCCESS][SUBSCRIPTION_CREATE_SUCCESS] artistId=${artist.id} email=${artist.email} tier=${tier} duration=${duration}ms`);

      res.json(result);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[ERROR][SUBSCRIPTION_CREATE_FAILED] artistId=${artist.id} email=${artist.email} tier=${tier} duration=${duration}ms`, error);
      res.status(500).json({ message: error.message || "Failed to create subscription" });
    }
  });

  // Upgrade subscription to higher tier
  app.post("/api/artists/subscription/upgrade", subscriptionMutationLimiter, requireArtist, async (req, res) => {
    const startTime = Date.now();
    const artist = req.user!;
    const { tier, idempotencyKey } = req.body;
    
    try {
      if (tier !== 'pro' && tier !== 'elite') {
        return res.status(400).json({ message: "Invalid tier. Must be 'pro' or 'elite'" });
      }

      if (!idempotencyKey || typeof idempotencyKey !== 'string') {
        return res.status(400).json({ message: "Idempotency key is required" });
      }

      await subscriptionService.upgradeSubscription(artist.id, tier, idempotencyKey);
      
      const duration = Date.now() - startTime;
      console.log(`[SUCCESS][SUBSCRIPTION_UPGRADE_SUCCESS] artistId=${artist.id} email=${artist.email} tier=${tier} duration=${duration}ms`);
      
      res.json({ message: "Subscription upgraded successfully" });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[ERROR][SUBSCRIPTION_UPGRADE_FAILED] artistId=${artist.id} email=${artist.email} tier=${tier} duration=${duration}ms`, error);
      res.status(500).json({ message: error.message || "Failed to upgrade subscription" });
    }
  });

  // Cancel subscription (at end of billing period)
  app.post("/api/artists/subscription/cancel", subscriptionMutationLimiter, requireArtist, async (req, res) => {
    const startTime = Date.now();
    const artist = req.user!;
    
    try {
      await subscriptionService.cancelSubscription(artist.id);
      
      const duration = Date.now() - startTime;
      console.log(`[SUCCESS][SUBSCRIPTION_CANCEL_SUCCESS] artistId=${artist.id} email=${artist.email} duration=${duration}ms`);
      
      res.json({ message: "Subscription will be canceled at the end of the billing period" });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[ERROR][SUBSCRIPTION_CANCEL_FAILED] artistId=${artist.id} email=${artist.email} duration=${duration}ms`, error);
      res.status(500).json({ message: error.message || "Failed to cancel subscription" });
    }
  });

  // Reactivate canceled subscription
  app.post("/api/artists/subscription/reactivate", subscriptionMutationLimiter, requireArtist, async (req, res) => {
    const startTime = Date.now();
    const artist = req.user!;
    
    try {
      await subscriptionService.reactivateSubscription(artist.id);
      
      const duration = Date.now() - startTime;
      console.log(`[SUCCESS][SUBSCRIPTION_REACTIVATE_SUCCESS] artistId=${artist.id} email=${artist.email} duration=${duration}ms`);
      
      res.json({ message: "Subscription reactivated successfully" });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[ERROR][SUBSCRIPTION_REACTIVATE_FAILED] artistId=${artist.id} email=${artist.email} duration=${duration}ms`, error);
      res.status(500).json({ message: "Failed to reactivate subscription" });
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
      const { id } = req.params;
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
      const { id } = req.params;
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
      const { id } = req.params;
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
      const { id } = req.params;
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
                  This is an official message from 247 Print Network administration.
                </p>
              </div>
            `,
            textBody: `Hello ${artist.name},\n\n${message.trim()}\n\n---\nThis is an official message from 247 Print Network administration.`,
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

  // Update admin notes for artist (admin only)
  app.patch("/api/admin/artists/:id/notes", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
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
      const artistId = req.params.id;
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

  // Stripe subscription webhook
  app.post("/api/webhooks/stripe/subscription", async (req, res) => {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

      const sig = req.headers['stripe-signature'];
      if (!sig) {
        return res.status(400).send('Missing Stripe signature');
      }

      const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error('STRIPE_SUBSCRIPTION_WEBHOOK_SECRET not configured');
        return res.status(500).send('Webhook secret not configured');
      }

      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );

      await subscriptionService.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (error: any) {
      console.error("Subscription webhook error:", error);
      res.status(400).send(`Webhook Error: ${error.message}`);
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

  // Admin: Email template preview endpoints (for QA testing)
  app.get("/api/admin/email-preview/:templateName", requireAdmin, async (req, res) => {
    try {
      const { templateName } = req.params;
      const { trialDay3Email, trialEndingSoonEmail, trialLastChanceEmail, reEngagementEmail, templateMetadata, replaceEmailPlaceholders } = await import('./email-templates');
      
      const metadata = templateMetadata[templateName];
      if (!metadata) {
        return res.status(404).json({ 
          message: "Template not found",
          available: Object.keys(templateMetadata)
        });
      }

      const params = req.query as Record<string, string>;
      const data = { ...metadata.sampleData, ...params };
      const domain = req.get('host') || 'example.replit.app';
      
      let html: string;
      switch (templateName) {
        case 'trial-day-3':
          html = trialDay3Email({ ...data, domain });
          break;
        case 'trial-ending-soon':
          html = trialEndingSoonEmail({ ...data, domain });
          break;
        case 'trial-last-chance':
          html = trialLastChanceEmail({ ...data, domain });
          break;
        case 're-engagement':
          html = reEngagementEmail({ ...data, domain });
          break;
        default:
          return res.status(404).json({ message: "Unknown template" });
      }

      html = replaceEmailPlaceholders(html, {
        unsubscribeUrl: `https://${domain}/unsubscribe`,
        domain
      });

      res.type('html').send(html);
    } catch (error: any) {
      console.error("Email preview error:", error);
      res.status(500).json({ message: "Failed to generate preview" });
    }
  });

  app.get("/api/admin/email-templates", requireAdmin, async (_req, res) => {
    try {
      const { templateMetadata } = await import('./email-templates');
      res.json(templateMetadata);
    } catch (error: any) {
      console.error("Get email templates error:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
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
  // ADMIN CHALLENGE MANAGEMENT
  // ====================

  // Admin: Get all challenges
  app.get("/api/admin/challenges", requireAdmin, async (req, res) => {
    try {
      const challenges = await storage.getActiveChallenges();
      res.json(challenges);
    } catch (error: any) {
      console.error("Error fetching challenges:", error);
      res.status(500).json({ message: "Failed to fetch challenges" });
    }
  });

  // Admin: Create new challenge
  app.post("/api/admin/challenges", requireAdmin, async (req, res) => {
    try {
      const challengeData = req.body;
      
      // Create challenge in database
      const challenge = await storage.createChallenge({
        name: challengeData.name,
        description: challengeData.description,
        challengeType: challengeData.challengeType,
        metric: challengeData.metric,
        goal: challengeData.goal || null,
        startDate: new Date(challengeData.startDate),
        endDate: new Date(challengeData.endDate),
        firstPlacePrize: challengeData.firstPlacePrize,
        secondPlacePrize: challengeData.secondPlacePrize || null,
        thirdPlacePrize: challengeData.thirdPlacePrize || null,
        prizeDescription: challengeData.prizeDescription || null,
        status: new Date(challengeData.startDate) > new Date() ? "upcoming" : "active",
      });

      res.status(201).json(challenge);
    } catch (error: any) {
      console.error("Error creating challenge:", error);
      res.status(500).json({ message: error.message || "Failed to create challenge" });
    }
  });

  // Admin: Update challenge status
  app.patch("/api/admin/challenges/:id/status", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await storage.updateChallengeStatus(id, status);
      res.json({ message: "Challenge status updated" });
    } catch (error: any) {
      console.error("Error updating challenge:", error);
      res.status(500).json({ message: "Failed to update challenge" });
    }
  });

  // ====================
  // GAMIFICATION ENDPOINTS
  // ====================

  // Public: Get activity feed (recent achievements and events)
  app.get("/api/activity-feed", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const feed = await storage.getActivityFeed(limit);
      res.json(feed);
    } catch (error: any) {
      console.error("Error fetching activity feed:", error);
      res.status(500).json({ message: "Failed to fetch activity feed" });
    }
  });

  // Public: Get leaderboard (top influencers)
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const { metric = 'conversions', period = 'all_time' } = req.query as { metric?: string; period?: string };
      const leaderboard = await storage.getLeaderboard(metric, period);
      res.json(leaderboard);
    } catch (error: any) {
      console.error("Get leaderboard error:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // Protected: Get influencer's badges/achievements
  app.get("/api/influencers/badges", requireInfluencer, async (req, res) => {
    try {
      const badges = await storage.getInfluencerBadges(req.user!.id);
      res.json(badges);
    } catch (error: any) {
      console.error("Get influencer badges error:", error);
      res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  // Protected: Get all achievements (catalog)
  app.get("/api/achievements", requireInfluencer, async (req, res) => {
    try {
      const achievements = await storage.getAllAchievements();
      res.json(achievements);
    } catch (error: any) {
      console.error("Get achievements error:", error);
      res.status(500).json({ message: "Failed to fetch achievements" });
    }
  });

  // Protected: Get active challenges
  app.get("/api/challenges", requireInfluencer, async (req, res) => {
    try {
      const challenges = await storage.getActiveChallenges();
      res.json(challenges);
    } catch (error: any) {
      console.error("Get challenges error:", error);
      res.status(500).json({ message: "Failed to fetch challenges" });
    }
  });

  // Protected: Join a challenge
  app.post("/api/challenges/:id/join", requireInfluencer, async (req, res) => {
    try {
      const participation = await storage.joinChallenge(req.params.id, req.user!.id);
      res.json(participation);
    } catch (error: any) {
      console.error("Join challenge error:", error);
      res.status(400).json({ message: error.message || "Failed to join challenge" });
    }
  });

  // Protected: Get challenge leaderboard
  app.get("/api/challenges/:id/leaderboard", requireInfluencer, async (req, res) => {
    try {
      const leaderboard = await storage.getChallengeLeaderboard(req.params.id);
      res.json(leaderboard);
    } catch (error: any) {
      console.error("Get challenge leaderboard error:", error);
      res.status(500).json({ message: "Failed to fetch challenge leaderboard" });
    }
  });

  // Protected: Get activity feed
  app.get("/api/activity-feed", requireInfluencer, async (req, res) => {
    try {
      const { limit = 20 } = req.query as { limit?: string };
      const feed = await storage.getActivityFeed(parseInt(limit as string));
      res.json(feed);
    } catch (error: any) {
      console.error("Get activity feed error:", error);
      res.status(500).json({ message: "Failed to fetch activity feed" });
    }
  });

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
      const influencer = await storage.getInfluencer(req.params.id);
      if (!influencer) {
        return res.status(404).json({ message: "Influencer not found" });
      }

      // Get performance stats
      const stats = await storage.getInfluencerPerformanceSummary(req.params.id);

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
      const influencer = await storage.approveInfluencer(req.params.id);
      
      // Send approval email (non-blocking)
      emailService.sendInfluencerApprovalEmail(
        influencer.email,
        influencer.name,
        influencer.id,
        influencer.affiliateCode
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

      const influencer = await storage.updateInfluencer(req.params.id, updates);
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

      const subscriptionTier = artist.subscriptionTier || "free";
      if (subscriptionTier === "free") {
        const artworks = await storage.getArtworksByArtist(req.user!.id);
        const FREE_TIER_LIMIT = 20;
        
        if (artworks.length >= FREE_TIER_LIMIT) {
          return res.status(403).json({ 
            error: `Upload limit reached. Free tier allows ${FREE_TIER_LIMIT} artworks. Upgrade to Pro or Elite for unlimited uploads.`,
            upgradeRequired: true,
            requiredTier: "pro",
            currentCount: artworks.length,
            limit: FREE_TIER_LIMIT
          });
        }
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
      
      console.log(`[Upload] Image validated: ${validation.dimensions?.width}×${validation.dimensions?.height} pixels`);
      
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

  // Upload image for upscale widget (no strict quality checks)
  app.post("/api/upload/design", requireArtist, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
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
      
      console.log(`[Upload Design] File uploaded for upscale widget: ${filename}`);
      
      // Return URL in format expected by UpscaleWidget (key: 'url', not 'imageUrl')
      res.status(200).json({ url: imageUrl });
    } catch (error: any) {
      console.error("Upload design error:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
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

      const subscriptionTier = artist.subscriptionTier || "free";
      const FREE_TIER_LIMIT = 20;

      try {
        // Use transactional method that enforces limit atomically
        const artwork = await storage.createArtworkWithLimitCheck(
          {
            ...data,
            seoSlug,
            ipDeclarationText,
          } as any,
          subscriptionTier,
          FREE_TIER_LIMIT
        );
        
        res.status(201).json(normalizeArtwork(artwork, req));
      } catch (limitError: any) {
        // Check if this is a limit exceeded error
        if (limitError.message && limitError.message.includes("Upload limit reached")) {
          const artworks = await storage.getArtworksByArtist(req.user!.id);
          return res.status(403).json({ 
            message: limitError.message,
            upgradeRequired: true,
            requiredTier: "pro",
            currentCount: artworks.length,
            limit: FREE_TIER_LIMIT
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
      const { id } = req.params;
      
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
          
          // Get image dimensions for variant qualification
          let dimensions = null;
          
          // Try to get dimensions from local file if it's a relative path
          if (!artwork.imageUrl.startsWith("http")) {
            const imagePath = path.join(uploadDir, path.basename(artwork.imageUrl));
            if (fs.existsSync(imagePath)) {
              dimensions = getImageDimensions(imagePath);
            }
          }
          
          if (!dimensions) {
            console.warn("Could not read image dimensions from local file, skipping variant qualification");
            throw new Error("Image dimensions unavailable - cannot qualify variants. Please re-upload artwork.");
          }
          
          console.log(`Image dimensions: ${dimensions.width}×${dimensions.height}px`);
          
          const printifyResult = await createWallArtProducts(
            imageUrl,
            artwork.title,
            dimensions.width,
            dimensions.height,
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
                console.log(`[Mockup Sync] ✅ Successfully added ${result.mockupsAdded} mockup images to Shopify product ${shopifyProductId}`);
              } else {
                console.warn(`[Mockup Sync] ⚠️ Mockup sync failed or incomplete:`, result.errors);
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
      const { id } = req.params;
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
      const { id } = req.params;
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
      const { id } = req.params;
      const reports = await storage.getViolationReportsByArtwork(id);
      res.json(reports);
    } catch (error: any) {
      console.error("Get violations error:", error);
      res.status(500).json({ message: "Failed to fetch violation reports" });
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
      const { id } = req.params;
      
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
            // Build absolute image URL
            const replitDomain = process.env.REPLIT_DOMAINS 
              ? process.env.REPLIT_DOMAINS.split(',').map(d => d.trim()).find(d => !d.includes('-')) || process.env.REPLIT_DOMAINS.split(',')[0].trim()
              : null;
            
            const baseUrl = replitDomain
              ? `https://${replitDomain}`
              : `http://localhost:${process.env.PORT || 5000}`;
            
            const imageUrl = artwork.imageUrl.startsWith("http") 
              ? artwork.imageUrl 
              : `${baseUrl}${artwork.imageUrl}`;

            // Update artwork status
            await storage.updateArtwork(artworkId, {
              status: "approved",
            });

            // Create Shopify product (non-blocking)
            if (isShopifyConfigured()) {
              createArtworkProduct({
                title: artwork.title,
                description: artwork.description || "",
                artworkStory: artwork.artworkStory,
                suggestedUse: artwork.suggestedUse,
                styleTags: artwork.styleTags || [],
                imageUrl,
                artistName: artist.name,
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
      const { id } = req.params;
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
      const { id } = req.params;
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
        ? `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/success-stories/${artistTestimonial.shareSlug}?utm_source=artist-referral&utm_medium=testimonial&utm_campaign=${artist.referralCode}&ref=${artist.referralCode}`
        : null;

      res.json({
        referralCode: artist.referralCode,
        referralLink,
        testimonialShareUrl,
        stats: {
          totalReferralSales: referralSales.length,
          totalReferralEarnings,
          totalArtistsRecruited: recruitedArtists.length,
          totalRecruitmentEarnings,
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
      const { id } = req.params;
      
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
      const { artistId } = req.params;
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

  // Artist: Get featured subscription status
  app.get("/api/artists/featured-status", requireArtist, async (req, res) => {
    try {
      const artist = req.user!;
      const subscription = await storage.getActiveFeaturedSubscriptionByArtist(artist.id);
      
      res.json({
        hasActiveSubscription: !!subscription,
        subscription: subscription || null,
      });
    } catch (error: any) {
      console.error("Get featured status error:", error);
      res.status(500).json({ message: "Failed to fetch featured status" });
    }
  });

  // ==================== AI PORTRAIT GENERATION ROUTES ====================
  
  // Artist: Get AI credit balance
  app.get("/api/ai/credits", requireArtist, async (req, res) => {
    try {
      const artist = req.user!;
      const credits = await storage.getOrCreateAiCredits(artist.id, 'artist');
      
      res.json({
        freeCreditsRemaining: credits.freeCreditsRemaining,
        paidCreditsRemaining: credits.paidCreditsRemaining,
        totalCredits: credits.freeCreditsRemaining + credits.paidCreditsRemaining,
        totalFreeCreditsGranted: credits.totalFreeCreditsGranted,
      });
    } catch (error: any) {
      console.error("Get AI credits error:", error);
      res.status(500).json({ message: "Failed to fetch AI credits" });
    }
  });

  // Artist: Generate AI content (titles, descriptions, tags, stories)
  app.post("/api/ai/generate-content", requireArtist, async (req, res) => {
    try {
      const artist = req.user!;
      const { contentType, imageUrl, artworkTitle, existingDescription, style, medium, colors } = req.body;
      
      // Validate content type
      const validTypes = ['title', 'description', 'tags', 'artworkStory', 'suggestedUse'];
      if (!contentType || !validTypes.includes(contentType)) {
        return res.status(400).json({ 
          message: `Invalid content type. Must be one of: ${validTypes.join(', ')}` 
        });
      }

      // Check subscription tier - content generation is free for all tiers
      // (it's much cheaper than image generation)
      const artistData = await storage.getArtistById(artist.id);
      if (!artistData) {
        return res.status(404).json({ message: "Artist not found" });
      }

      // Get AI-friendly preview image if needed (handles large files automatically)
      let aiImageUrl = imageUrl;
      if (imageUrl) {
        try {
          const { getAIPreviewImage, AIContentError } = await import('./lib/vision-preview-helper');
          
          // Convert relative path to full URL
          let fullImageUrl = imageUrl;
          if (!imageUrl.startsWith('http')) {
            const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
            const host = req.headers.host;
            fullImageUrl = `${protocol}://${host}${imageUrl}`;
          }
          
          // Get AI preview (will use original if <20MB, create preview if larger)
          const previewPath = await getAIPreviewImage(fullImageUrl);
          
          // Convert back to full URL if needed
          if (previewPath && !previewPath.startsWith('http')) {
            const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
            const host = req.headers.host;
            aiImageUrl = `${protocol}://${host}${previewPath}`;
          } else {
            aiImageUrl = previewPath;
          }
        } catch (error: any) {
          const { AIContentError, AIContentErrorCode } = await import('./lib/vision-preview-helper');
          
          if (error instanceof AIContentError) {
            return res.status(400).json({
              status: 'error',
              code: error.code,
              userMessage: error.userMessage,
              developerMessage: error.developerMessage
            });
          }
          throw error;
        }
      }

      // Generate content using GPT-4o (Vision if image provided)
      const { content, tokensUsed } = await generateArtworkContent({
        contentType,
        imageUrl: aiImageUrl,
        artworkTitle,
        existingDescription,
        style,
        medium,
        colors,
      });

      console.log(`[SUCCESS][AI_CONTENT] Generated ${contentType} for artist ${artist.id} (${tokensUsed} tokens)`);

      res.json({
        content,
        tokensUsed,
        contentType,
      });
    } catch (error: any) {
      console.error("[ERROR][AI_CONTENT] Content generation failed:", error.message);
      
      // Return structured error response
      const { AIContentErrorCode } = await import('./lib/vision-preview-helper');
      res.status(500).json({ 
        status: 'error',
        code: AIContentErrorCode.AI_UNKNOWN_ERROR,
        userMessage: "Failed to generate content. Please try again in a moment.",
        developerMessage: error.message || "Unknown error"
      });
    }
  });
  
  // Artist: Generate AI image
  app.post("/api/ai/generate", requireArtist, async (req, res) => {
    try {
      const artist = req.user!;
      const { prompt, size = "1024x1024" } = req.body;
      
      // Check subscription tier - AI Studio requires Pro or Elite
      const artistData = await storage.getArtistById(artist.id);
      if (!artistData) {
        return res.status(404).json({ message: "Artist not found" });
      }
      
      const subscriptionTier = artistData.subscriptionTier || "free";
      if (subscriptionTier === "free") {
        return res.status(403).json({ 
          message: "AI Art Studio is a Pro feature. Upgrade to Pro or Elite to access AI-powered artwork generation.",
          upgradeRequired: true,
          requiredTier: "pro"
        });
      }
      
      // Validate prompt
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ message: "Prompt is required" });
      }
      
      const promptValidation = validatePrompt(prompt);
      if (!promptValidation.valid) {
        return res.status(400).json({ message: promptValidation.error });
      }
      
      // Validate size
      if (!["1024x1024", "512x512", "256x256"].includes(size)) {
        return res.status(400).json({ message: "Invalid image size" });
      }
      
      // Check if user has credits
      const creditResult = await storage.deductCredit(artist.id, 'artist');
      if (!creditResult.success) {
        return res.status(402).json({ 
          message: "Insufficient credits. Purchase more credits to continue generating images.",
          remainingCredits: 0
        });
      }
      
      // Create generation record
      const generation = await storage.createAiGeneration({
        artistId: artist.id,
        prompt,
        size,
        model: "gpt-image-1",
        generationType: "artist_studio",
      });
      
      try {
        // Generate image using OpenAI
        const { imageBuffer, costUsd } = await generateAiImage(prompt, size as any);
        
        // Save image to disk
        const imageUrl = await saveAiImage(imageBuffer, artist.id, "artist_studio");
        
        // Update generation record with success
        await storage.updateAiGeneration(generation.id, {
          imageUrl,
          status: "completed",
          costUsd: costUsd.toString(),
        });
        
        res.json({
          id: generation.id,
          imageUrl,
          prompt,
          size,
          remainingCredits: creditResult.remainingCredits,
          status: "completed",
        });
      } catch (generationError: any) {
        // Update generation record with failure
        await storage.updateAiGeneration(generation.id, {
          status: "failed",
          errorMessage: generationError.message,
        });
        
        // Refund the credit to the correct balance based on where it was deducted from
        const credits = await storage.getOrCreateAiCredits(artist.id, 'artist');
        
        if (creditResult.deductedFrom === 'free') {
          // Refund to free credits
          await storage.updateAiCredits(credits.id, {
            freeCreditsRemaining: credits.freeCreditsRemaining + 1,
          });
        } else {
          // Refund to paid credits
          await storage.updateAiCredits(credits.id, {
            paidCreditsRemaining: credits.paidCreditsRemaining + 1,
          });
        }
        
        throw generationError;
      }
    } catch (error: any) {
      console.error("AI generation error:", error);
      res.status(500).json({ message: error.message || "Failed to generate AI image" });
    }
  });
  
  // Artist: Get AI generation history
  app.get("/api/ai/generations", requireArtist, async (req, res) => {
    try {
      const artist = req.user!;
      const generations = await storage.getAiGenerationsByArtist(artist.id);
      res.json(generations);
    } catch (error: any) {
      console.error("Get AI generations error:", error);
      res.status(500).json({ message: "Failed to fetch AI generations" });
    }
  });
  
  // Artist: Get single AI generation
  app.get("/api/ai/generations/:id", requireArtist, async (req, res) => {
    try {
      const artist = req.user!;
      const generation = await storage.getAiGeneration(req.params.id);
      
      if (!generation) {
        return res.status(404).json({ message: "Generation not found" });
      }
      
      // Ensure artist owns this generation
      if (generation.artistId !== artist.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      res.json(generation);
    } catch (error: any) {
      console.error("Get AI generation error:", error);
      res.status(500).json({ message: "Failed to fetch AI generation" });
    }
  });
  
  // Admin: Get all AI generations for monitoring
  app.get("/api/admin/ai/generations", requireAdmin, async (_req, res) => {
    try {
      const generations = await storage.getAllAiGenerations();
      res.json(generations);
    } catch (error: any) {
      console.error("Admin get all AI generations error:", error);
      res.status(500).json({ message: "Failed to fetch AI generations" });
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
      const testimonial = await storage.getTestimonialBySlugWithArtist(req.params.slug);
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

  // Public: Get featured artists for homepage (tier-based + performance)
  app.get("/api/featured-artists", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 4;
      const { getFeaturedArtists } = await import("./lib/featured-artists-service");
      const artists = await getFeaturedArtists(limit);
      res.json(artists);
    } catch (error: any) {
      console.error("Get featured artists error:", error);
      res.status(500).json({ message: "Failed to fetch featured artists" });
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
      const { id } = req.params;
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
      const { id } = req.params;
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

  // ===== ADMIN FEATURED PLACEMENT MANAGEMENT =====

  // Admin: Get featured placements overview
  app.get("/api/admin/featured-placements", requireAdmin, async (_req, res) => {
    try {
      const overview = await storage.getFeaturedPlacementsOverview();
      res.json(overview);
    } catch (error: any) {
      console.error("Get featured placements error:", error);
      res.status(500).json({ message: "Failed to fetch featured placements" });
    }
  });

  // Admin: Create admin override for a testimonial
  app.post("/api/admin/featured-overrides", requireAdmin, async (req, res) => {
    try {
      const { testimonialId } = req.body;
      
      if (!testimonialId) {
        return res.status(400).json({ message: "testimonialId is required" });
      }
      
      const adminId = req.session.adminId!;
      const result = await storage.createAdminOverride(testimonialId, adminId);
      
      res.status(201).json({
        message: "Admin override created successfully",
        subscription: result.subscription,
        totalSlots: result.totalSlots,
      });
    } catch (error: any) {
      console.error("Create admin override error:", error);
      res.status(400).json({ message: error.message || "Failed to create admin override" });
    }
  });

  // Admin: Remove admin override
  app.delete("/api/admin/featured-overrides/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const adminId = req.session.adminId!;
      await storage.removeAdminOverride(id, adminId, reason);
      
      res.json({ message: "Admin override removed successfully" });
    } catch (error: any) {
      console.error("Remove admin override error:", error);
      res.status(400).json({ message: error.message || "Failed to remove admin override" });
    }
  });

  // ===== FEATURED SUBSCRIPTIONS - STRIPE CHECKOUT & ROTATION =====

  // Admin: Trigger monthly merit-based rotation
  app.post("/api/admin/featured/rotate", requireAdmin, async (_req, res) => {
    try {
      const { performMonthlyRotation } = await import("./lib/featured-rotation-service");
      
      console.log('🔄 Admin triggered merit-based rotation');
      const result = await performMonthlyRotation();
      
      res.json({
        success: result.success,
        message: result.message,
        details: {
          rotatedIn: result.rotatedIn.length,
          rotatedOut: result.rotatedOut.length,
          keptActive: result.keptActive.length,
        },
        data: result,
      });
    } catch (error: any) {
      console.error("Featured rotation error:", error);
      res.status(500).json({ message: "Rotation failed", error: error.message });
    }
  });

  // Admin: Get current rotation status
  app.get("/api/admin/featured/status", requireAdmin, async (_req, res) => {
    try {
      const { getRotationStatus } = await import("./lib/featured-rotation-service");
      
      const status = await getRotationStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Get rotation status error:", error);
      res.status(500).json({ message: "Failed to get rotation status" });
    }
  });

  // Artist: Create Stripe Checkout session for premium featured subscription
  app.post("/api/featured/checkout", requireArtist, async (req, res) => {
    try {
      const artistId = (req as any).session.userId;
      const { testimonialId } = req.body;

      if (!testimonialId) {
        return res.status(400).json({ message: "Testimonial ID is required" });
      }

      // Verify testimonial exists and belongs to this artist
      const testimonial = await storage.getTestimonial(testimonialId);
      if (!testimonial) {
        return res.status(404).json({ message: "Testimonial not found" });
      }
      if (testimonial.artistId !== artistId) {
        return res.status(403).json({ message: "This testimonial does not belong to you" });
      }
      if (!testimonial.isActive) {
        return res.status(400).json({ message: "Only active testimonials can be featured" });
      }

      // Check for existing active premium subscription for this testimonial
      const existingSubs = await storage.getFeaturedSlotsByTier("premium");
      const hasActiveSubscription = existingSubs.some(
        (sub) => sub.testimonialId === testimonialId && !sub.endDate
      );

      if (hasActiveSubscription) {
        return res.status(400).json({ 
          message: "This testimonial already has an active premium featured subscription" 
        });
      }

      // Validate Stripe configuration
      const priceId = process.env.STRIPE_FEATURED_PRICE_ID;
      if (!priceId) {
        console.error("❌ STRIPE_FEATURED_PRICE_ID not configured");
        return res.status(500).json({ 
          message: "Featured subscriptions are not configured. Please contact support." 
        });
      }

      // Import stripe client
      const { stripe } = await import("./lib/stripe-connect");

      // Get base URL for success/cancel redirect
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 5000}`;

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/artist/referrals?featured=success`,
        cancel_url: `${baseUrl}/artist/referrals?featured=cancelled`,
        metadata: {
          artistId,
          testimonialId,
          subscriptionType: 'premium_featured',
        },
        subscription_data: {
          metadata: {
            artistId,
            testimonialId,
            subscriptionType: 'premium_featured',
          },
        },
      });

      console.log(`✅ Created Stripe Checkout session for artist ${artistId}, testimonial ${testimonialId}`);
      
      res.json({ 
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (error: any) {
      console.error("Featured checkout error:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // ============================================
  // 247 CreatorStack API Routes
  // ============================================

  // CreatorStack Authentication - Register
  app.post("/api/creatorstack/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;

      // Validate input
      if (!email || !password || !name) {
        return res.status(400).json({ message: "Email, password, and name are required" });
      }

      // Check if buyer already exists
      const existingBuyer = await storage.getCreatorstackBuyerByEmail(email);
      if (existingBuyer) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create buyer account
      const buyer = await storage.createCreatorstackBuyer({
        email,
        password: hashedPassword,
        name,
        isPro: false,
      });

      // Set up session (using creatorstack-specific session key)
      req.session.creatorstackBuyerId = buyer.id;
      req.session.save((err: Error | undefined) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        
        console.log(`✅ CreatorStack buyer registered: ${email}`);
        res.json({ 
          message: "Account created successfully",
          buyer: {
            id: buyer.id,
            email: buyer.email,
            name: buyer.name,
            isPro: buyer.isPro,
          }
        });
      });
    } catch (error: any) {
      console.error("CreatorStack registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // CreatorStack Authentication - Login
  app.post("/api/creatorstack/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find buyer
      const buyer = await storage.getCreatorstackBuyerByEmail(email);
      if (!buyer) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, buyer.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ message: "Login failed" });
        }

        // Set up session
        req.session.creatorstackBuyerId = buyer.id;
        req.session.save((saveErr: Error | undefined) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Failed to create session" });
          }

          console.log(`✅ CreatorStack buyer logged in: ${email}`);
          res.json({
            message: "Login successful",
            buyer: {
              id: buyer.id,
              email: buyer.email,
              name: buyer.name,
              isPro: buyer.isPro,
            }
          });
        });
      });
    } catch (error: any) {
      console.error("CreatorStack login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // CreatorStack Authentication - Logout
  app.post("/api/creatorstack/auth/logout", async (req, res) => {
    try {
      const buyerId = req.session.creatorstackBuyerId;
      
      req.session.destroy((err: Error | null) => {
        if (err) {
          console.error("Session destroy error:", err);
          return res.status(500).json({ message: "Failed to logout" });
        }

        console.log(`✅ CreatorStack buyer logged out: ${buyerId}`);
        res.json({ message: "Logged out successfully" });
      });
    } catch (error: any) {
      console.error("CreatorStack logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // CreatorStack - Get Current Buyer with Purchases
  app.get("/api/creatorstack/buyer/me", async (req, res) => {
    try {
      const buyerId = req.session.creatorstackBuyerId;
      
      if (!buyerId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get buyer
      const buyer = await storage.getCreatorstackBuyerById(buyerId);
      if (!buyer) {
        return res.status(404).json({ message: "Buyer not found" });
      }

      // Get purchases with kit details
      const purchases = await storage.getCreatorstackPurchasesByBuyerId(buyerId);
      
      // Attach kit details to each purchase
      const purchasesWithKits = await Promise.all(
        purchases.map(async (purchase) => {
          const kit = await storage.getCreatorstackKitById(purchase.kitId);
          return {
            ...purchase,
            kit,
          };
        })
      );

      res.json({
        ...buyer,
        password: undefined, // Don't send password hash
        purchases: purchasesWithKits,
      });
    } catch (error: any) {
      console.error("Get buyer error:", error);
      res.status(500).json({ message: "Failed to get buyer information" });
    }
  });

  // CreatorStack - Track Kit Access
  app.post("/api/creatorstack/purchases/:purchaseId/track-access", async (req, res) => {
    try {
      const buyerId = req.session.creatorstackBuyerId;
      const { purchaseId } = req.params;

      if (!buyerId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Verify purchase belongs to buyer
      const purchase = await storage.getCreatorstackPurchaseById(purchaseId);
      if (!purchase || purchase.buyerId !== buyerId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Update last accessed timestamp
      await storage.updateCreatorstackPurchaseAccess(purchaseId);

      res.json({ message: "Access tracked successfully" });
    } catch (error: any) {
      console.error("Track access error:", error);
      res.status(500).json({ message: "Failed to track access" });
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

  // Calculate artist break-even analysis
  app.get("/api/admin/financial/artist-breakeven", requireAdmin, async (req, res) => {
    try {
      const { calculateArtistBreakEven } = await import('./lib/financial-service');
      const { tier, averageOrderValue } = req.query;

      const subscriptionTier = (tier as 'free' | 'pro' | 'elite') || 'pro';
      const avgOrderValue = averageOrderValue ? parseFloat(averageOrderValue as string) : 89.99;

      const breakeven = calculateArtistBreakEven(subscriptionTier, avgOrderValue);
      res.json(breakeven);
    } catch (error: any) {
      console.error("Break-even calculation error:", error);
      res.status(500).json({ message: "Failed to calculate break-even" });
    }
  });

  // Get all artist break-even scenarios (all tiers)
  app.get("/api/admin/financial/all-breakeven", requireAdmin, async (req, res) => {
    try {
      const { calculateArtistBreakEven } = await import('./lib/financial-service');
      const { averageOrderValue } = req.query;
      const avgOrderValue = averageOrderValue ? parseFloat(averageOrderValue as string) : 89.99;

      const breakevens = {
        free: calculateArtistBreakEven('free', avgOrderValue),
        pro: calculateArtistBreakEven('pro', avgOrderValue),
        elite: calculateArtistBreakEven('elite', avgOrderValue),
      };

      res.json(breakevens);
    } catch (error: any) {
      console.error("All break-even calculation error:", error);
      res.status(500).json({ message: "Failed to calculate break-even scenarios" });
    }
  });

  // Get Printify product costs (live or estimated)
  app.get("/api/admin/financial/printify-costs", requireAdmin, async (req, res) => {
    try {
      const { getPrintifyProductCost, WALL_ART_BLUEPRINTS } = await import('./lib/financial-service');
      const { blueprintId } = req.query;

      if (!blueprintId) {
        // Return all product costs
        const costs = await Promise.all([
          getPrintifyProductCost(WALL_ART_BLUEPRINTS.POSTER),
          getPrintifyProductCost(WALL_ART_BLUEPRINTS.CANVAS),
          getPrintifyProductCost(WALL_ART_BLUEPRINTS.FRAMED),
          getPrintifyProductCost(WALL_ART_BLUEPRINTS.METAL),
        ]);

        res.json({
          poster: costs[0],
          canvas: costs[1],
          framed: costs[2],
          metal: costs[3],
        });
      } else {
        const cost = await getPrintifyProductCost(parseInt(blueprintId as string));
        res.json(cost);
      }
    } catch (error: any) {
      console.error("Printify costs error:", error);
      res.status(500).json({ message: "Failed to fetch Printify costs" });
    }
  });

  // Get trial analytics (trial conversion metrics and revenue impact)
  app.get("/api/admin/analytics/trials", requireAdmin, async (req, res) => {
    try {
      const { calculateTrialAnalytics } = await import('./lib/trial-analytics-service');
      const { range, tier } = req.query;
      
      // Validate range parameter
      const validRanges = ['7d', '30d', '90d', 'all'];
      const selectedRange = validRanges.includes(range as string) 
        ? (range as '7d' | '30d' | '90d' | 'all')
        : 'all';
      
      // Validate tier parameter
      const selectedTier = (tier === 'pro' || tier === 'elite') 
        ? tier 
        : undefined;
      
      const analytics = await calculateTrialAnalytics(selectedRange, selectedTier);
      res.json(analytics);
    } catch (error: any) {
      console.error("Trial analytics error:", error);
      res.status(500).json({ message: "Failed to calculate trial analytics" });
    }
  });

  // Process trial emails (Day 3, Ending Soon, Last Chance)
  app.post("/api/admin/trial-emails/process", requireAdmin, async (_req, res) => {
    try {
      const { processTrialEmails } = await import('./lib/trial-email-orchestrator');
      const results = await processTrialEmails();
      res.json({
        message: "Trial email processing complete",
        ...results
      });
    } catch (error: any) {
      console.error("Trial email processing error:", error);
      res.status(500).json({ message: "Failed to process trial emails" });
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
          tier: artist.subscriptionTier,
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
          tier: artist.subscriptionTier,
          previousUsed: artist.monthlyUpscalesUsed,
          newQuota: artist.subscriptionTier === 'elite' ? 'unlimited' : 
                    artist.subscriptionTier === 'pro' ? 25 : 5,
        },
      });
    } catch (error: any) {
      console.error("Reset credits error:", error);
      res.status(500).json({ message: error.message || "Failed to reset credits" });
    }
  });

  // Admin: Grant complimentary tier to artist (Pro or Elite without Stripe)
  app.post("/api/admin/grant-comp-tier", requireAdmin, async (req, res) => {
    try {
      const { email, tier, notes } = req.body;
      
      if (!email || !tier) {
        return res.status(400).json({ message: "Artist email and tier are required" });
      }

      if (tier !== 'pro' && tier !== 'elite' && tier !== 'free') {
        return res.status(400).json({ message: "Tier must be 'free', 'pro', or 'elite'" });
      }

      // Find artist by email
      const artist = await storage.getArtistByEmail(email);
      if (!artist) {
        return res.status(404).json({ message: "Artist not found with that email" });
      }

      const previousTier = artist.subscriptionTier;

      // Update artist tier (comp subscription = no Stripe subscription)
      await storage.updateArtist(artist.id, {
        subscriptionTier: tier,
        subscriptionStatus: tier === 'free' ? null : 'comp',
        // Clear Stripe fields since this is a comp subscription
        stripeCustomerId: tier === 'free' ? artist.stripeCustomerId : null,
        stripeSubscriptionId: tier === 'free' ? artist.stripeSubscriptionId : null,
      });

      // Log the admin action
      const admin = req.user!;
      await db.insert(adminActions).values({
        adminId: admin.id,
        adminEmail: admin.email,
        actionType: "grant_comp_tier",
        targetType: "artist",
        targetId: artist.id,
        targetEmail: artist.email,
        details: {
          previousTier,
          newTier: tier,
          subscriptionStatus: tier === 'free' ? null : 'comp',
        },
        notes: notes || `Admin granted ${tier} tier (complimentary)`,
        ipAddress: req.ip,
      });

      // Send notification email to artist
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
      emailService.sendEmail({
        recipientEmail: artist.email,
        recipientType: 'artist',
        recipientId: artist.id,
        emailType: 'tier_upgrade',
        subject: `Welcome to ${tierName} Tier!`,
        htmlBody: `
          <p>Hi ${artist.name},</p>
          <p>Great news! Your account has been upgraded to <strong>${tierName} tier</strong>.</p>
          <p><strong>Your new benefits:</strong></p>
          <ul>
            ${tier === 'pro' ? `
              <li>35% minimum royalty on all sales</li>
              <li>Unlimited artwork uploads</li>
              <li>25 AI upscales per month</li>
              <li>Homepage featured rotation</li>
            ` : tier === 'elite' ? `
              <li>45% royalty guarantee</li>
              <li>Unlimited artwork uploads</li>
              <li>Unlimited AI upscales</li>
              <li>Guaranteed homepage placement</li>
              <li>Priority artwork review</li>
            ` : `
              <li>30% royalty on all sales</li>
              <li>Up to 20 artworks</li>
              <li>5 AI upscales per month</li>
            `}
          </ul>
          <p>Log in to your dashboard to start using your new benefits!</p>
          <p>Best regards,<br>247 Print Network Team</p>
        `,
        textBody: `Hi ${artist.name},\n\nYour account has been upgraded to ${tierName} tier!\n\nBest regards,\n247 Print Network Team`,
      }).catch(err => {
        console.error('Failed to send tier upgrade email:', err);
      });

      res.json({
        success: true,
        message: `${tierName} tier granted to ${artist.name} (${artist.email})`,
        artist: {
          id: artist.id,
          name: artist.name,
          email: artist.email,
          previousTier,
          newTier: tier,
          subscriptionStatus: tier === 'free' ? null : 'comp',
        },
      });
    } catch (error: any) {
      console.error("Grant comp tier error:", error);
      res.status(500).json({ message: error.message || "Failed to grant tier" });
    }
  });

  // Get AI upscale usage analytics
  app.get("/api/admin/analytics/upscales", requireAdmin, async (req, res) => {
    try {
      const usage = await storage.getAllUpscaleUsage();
      
      // Normalize data: ensure tier, quotaType, costCents have valid defaults
      const normalized = usage.map(u => ({
        ...u,
        tier: u.tier || 'free',
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
      
      // Breakdown by tier (with null guard)
      const byTier = {
        free: normalized.filter(u => u.tier === 'free').length,
        pro: normalized.filter(u => u.tier === 'pro').length,
        elite: normalized.filter(u => u.tier === 'elite').length,
      };
      
      // Breakdown by quota type (with null guard)
      const byQuotaType = {
        registration_bonus: normalized.filter(u => u.quotaType === 'registration_bonus').length,
        monthly: normalized.filter(u => u.quotaType === 'monthly').length,
        elite_unlimited: normalized.filter(u => u.quotaType === 'elite_unlimited').length,
      };
      
      // Cost breakdown by tier (with null guard)
      const costByTier = {
        free: normalized.filter(u => u.tier === 'free').reduce((sum, u) => sum + u.costCents, 0) / 100,
        pro: normalized.filter(u => u.tier === 'pro').reduce((sum, u) => sum + u.costCents, 0) / 100,
        elite: normalized.filter(u => u.tier === 'elite').reduce((sum, u) => sum + u.costCents, 0) / 100,
      };
      
      // Cache hit analysis (upscales with no jobId means cache hit)
      const cacheHits = normalized.filter(u => !u.jobId && u.status === 'completed').length;
      const cacheHitRate = totalUpscales > 0 ? (cacheHits / totalUpscales * 100) : 0;
      
      res.json({
        totalUpscales,
        completedUpscales,
        failedUpscales,
        totalCostDollars: parseFloat(totalCostDollars.toFixed(2)),
        byTier,
        byQuotaType,
        costByTier: {
          free: parseFloat(costByTier.free.toFixed(2)),
          pro: parseFloat(costByTier.pro.toFixed(2)),
          elite: parseFloat(costByTier.elite.toFixed(2)),
        },
        cacheHits,
        cacheHitRate: parseFloat(cacheHitRate.toFixed(1)),
      });
    } catch (error: any) {
      console.error("Upscale analytics error:", error);
      res.status(500).json({ message: "Failed to calculate upscale analytics" });
    }
  });

  // CreatorStack Shopify Webhook TEST endpoint (NO HMAC verification - dev only!)
  // Use this for local testing without needing to calculate HMAC signatures
  app.post("/api/creatorstack/webhooks/shopify/test", async (req, res) => {
    try {
      console.log("[CreatorStack TEST] Processing test webhook (HMAC bypassed)");
      
      const shopifyOrder = req.body;
      
      // Process kit purchase and await result
      const result = await processCreatorStackPurchase(shopifyOrder);
      
      if (!result.success) {
        console.error(`[CreatorStack TEST] Purchase processing failed: ${result.error}`);
        return res.status(500).json({ success: false, error: result.error, details: result });
      }

      console.log(`[CreatorStack TEST] ✅ Purchase processed: ${result.processedItems.length} items`);
      res.status(200).json({ success: true, result });
    } catch (error: any) {
      console.error("[CreatorStack TEST] Webhook error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // CreatorStack Shopify Webhook - Kit Purchases
  // SECURED with HMAC verification (reuses existing Shopify webhook security)
  app.post("/api/creatorstack/webhooks/shopify", async (req: any, res) => {
    try {
      const hmac = req.headers['x-shopify-hmac-sha256'] as string;
      const shop = req.headers['x-shopify-shop-domain'];
      
      console.log(`[CreatorStack] Received Shopify webhook from ${shop}`);

      // CRITICAL: Verify HMAC signature using raw body
      if (!req.rawBody) {
        console.error("[CreatorStack] ❌ Raw body not available for HMAC verification");
        return res.status(500).send('Server configuration error');
      }

      if (!verifyShopifyWebhook(req.rawBody, hmac)) {
        console.warn("[CreatorStack] ⚠️ HMAC verification failed - rejecting webhook");
        return res.status(401).send('Unauthorized');
      }

      console.log("[CreatorStack] ✅ Webhook HMAC verified");

      // Body is already parsed by express.json middleware
      const shopifyOrder = req.body;
      
      // Process kit purchase and await result for reliable delivery
      const result = await processCreatorStackPurchase(shopifyOrder);
      
      if (!result.success) {
        console.error(`[CreatorStack] Purchase processing failed: ${result.error}`);
        // Return 500 so Shopify retries the webhook
        return res.status(500).send('Processing failed');
      }

      console.log(`[CreatorStack] ✅ Purchase processed: ${result.processedItems.length} items`);
      // Respond 200 only on success (Shopify won't retry)
      res.status(200).send('OK');
    } catch (error: any) {
      console.error("[CreatorStack] Webhook error:", error);
      res.status(500).send('Internal Server Error');
    }
  });

  // CreatorStack AI Prompt Generator
  app.post("/api/creatorstack/ai/generate", async (req, res) => {
    try {
      const buyerId = req.session.creatorstackBuyerId;

      if (!buyerId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { template, context, kitId } = req.body;

      if (!template || !context) {
        return res.status(400).json({ message: "Template and context are required" });
      }

      // Import AI generator
      const { generatePromptContent } = await import('./lib/creatorstack-ai-generator');

      // Generate content using GPT-5
      const result = await generatePromptContent({ template, context });

      if (!result.success) {
        return res.status(500).json({ 
          message: "AI generation failed", 
          error: result.error 
        });
      }

      // Track generation in database
      await storage.createCreatorstackPromptGeneration({
        buyerId,
        kitId: kitId || null,
        promptType: 'general', // Default type, can be extended based on template analysis
        userInput: template,
        aiResponse: result.generatedContent,
        tokensUsed: result.tokensUsed,
        model: 'gpt-4o',
      });

      console.log(`✅ CreatorStack AI: Generated ${result.tokensUsed} tokens for buyer ${buyerId}`);

      res.json({
        success: true,
        content: result.generatedContent,
        tokensUsed: result.tokensUsed,
      });
    } catch (error: any) {
      console.error("CreatorStack AI generation error:", error);
      res.status(500).json({ message: "AI generation failed" });
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

      const upscaledAnalysis = DpiValidatorService.calculateUpscaledQuality(
        width, 
        height, 
        DpiValidatorService.getUpscaleScale(width, height)
      );

      res.json({
        current: analysis,
        afterUpscaling: upscaledAnalysis,
        quota: quotaStatus,
        shouldRecommend: DpiValidatorService.shouldRecommendUpscaling(width, height),
        recommendedScale: DpiValidatorService.getUpscaleScale(width, height)
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
        console.log(`✅ Upscale cache hit for hash ${fileHash} - returning cached result WITHOUT consuming quota`);
        
        // DO NOT consume quota for cached results - deduplication should be free!
        // await UpscaleQuotaService.consumeQuota(artistId, quotaStatus.quotaType);
        
        const tier = artist.subscriptionTier || 'free';
        await UpscaleDeduplicationService.saveToCache({
          fileHash,
          artistId,
          quotaType: quotaStatus.quotaType,
          tier,
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

      const scale = DpiValidatorService.getUpscaleScale(width, height);
      const estimatedCost = ReplicateUpscaleService.estimateCost(scale);

      // Convert local path to publicly accessible URL for Replicate
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers.host;
      const publicImageUrl = imageUrl.startsWith('http') 
        ? imageUrl 
        : `${protocol}://${host}${imageUrl}`;

      try {
        const { predictionId } = await ReplicateUpscaleService.createUpscaleJob({
          imageUrl: publicImageUrl,
          scale,
          width,
          height
        });

        const tier = artist.subscriptionTier || 'free';
        const priority = tier === 'elite' ? 1 : tier === 'pro' ? 2 : 3;

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
          tier,
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

        console.log(`✅ Upscale job created: ${job.id} (Replicate: ${predictionId})`);

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
          tier: artist.subscriptionTier || 'free',
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

      const { jobId } = req.params;

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
