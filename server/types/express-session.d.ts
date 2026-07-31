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

    /**
     * Engine contributor session — a SEPARATE namespace from `user` above.
     *
     * Deliberately not reusing `user`: a marketplace artist session must never
     * grant access to engine earnings, and vice versa. They are different
     * identity systems over different tables, and collapsing them into one key
     * is how a marketplace login ends up reading a tenant's payout data.
     *
     * Carries `tenantId` because engine identity is `(tenant, contributor)`,
     * never a contributor id alone.
     */
    engineContributor?: {
      contributorId: string;
      tenantId: string;
      tenantSlug: string;
      name: string;
      email: string;
    };
  }
}
