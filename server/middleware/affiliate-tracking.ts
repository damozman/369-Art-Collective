import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

const AFFILIATE_COOKIE_NAME = "247pn_affiliate";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

/**
 * Middleware to capture affiliate referrals and set cookies
 * Looks for ?ref= parameter and sets a 30-day cookie
 */
export async function affiliateTrackingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const affiliateCode = req.query.ref as string | undefined;

    if (affiliateCode) {
      // Verify the affiliate code exists
      const influencer = await storage.getInfluencerByAffiliateCode(affiliateCode);

      if (influencer && influencer.status === "active") {
        // Set 30-day cookie with the affiliate code
        res.cookie(AFFILIATE_COOKIE_NAME, affiliateCode, {
          maxAge: COOKIE_MAX_AGE,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
        });

        // Log the affiliate click
        await storage.createAffiliateClick({
          affiliateCode,
          influencerId: influencer.id,
          ipAddress: req.ip || null,
          userAgent: req.get("user-agent") || null,
          referrer: req.get("referer") || null,
          utmSource: (req.query.utm_source as string) || null,
          utmMedium: (req.query.utm_medium as string) || null,
          utmCampaign: (req.query.utm_campaign as string) || null,
        });
      }
    }

    next();
  } catch (error) {
    // Don't block the request if tracking fails
    console.error("Affiliate tracking error:", error);
    next();
  }
}

/**
 * Helper function to get affiliate code from request cookies
 */
export function getAffiliateCodeFromCookie(req: Request): string | null {
  return req.cookies?.[AFFILIATE_COOKIE_NAME] || null;
}
