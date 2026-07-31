import "express-session";

declare module "express-session" {
  interface SessionData {
    // Current unified auth session (used by artist/admin login)
    user?: {
      id: string;
      email: string;
      name: string;
      type: "artist" | "admin" | "influencer";
      approved?: boolean;
      status?: string; // For influencer status
    };
    
    // Legacy session fields (may still be used by some routes)
    artistId?: string;
    adminId?: string;
    influencerId?: string;

    // Coming soon page unlock flag
    comingSoonUnlocked?: boolean;
  }
}
