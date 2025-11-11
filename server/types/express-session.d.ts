import "express-session";

declare module "express-session" {
  interface SessionData {
    artistId?: string;
    adminId?: string;
    influencerId?: string;
    creatorstackBuyerId?: string;
  }
}
