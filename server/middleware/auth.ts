import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { secureLog, safeUserContext } from "../lib/secure-logger";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        type: "artist" | "admin" | "influencer";
        approved?: boolean;
        status?: string; // For influencer status (pending/active/suspended)
      };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  req.user = req.session.user;
  next();
}

export async function requireArtist(req: Request, res: Response, next: NextFunction) {
  console.log("[DEBUG][AUTH] requireArtist middleware:", {
    path: req.path,
    sessionID: req.sessionID,
    hasSession: !!req.session,
    sessionUser: req.session?.user,
    sessionKeys: req.session ? Object.keys(req.session) : [],
    cookie: req.headers.cookie
  });

  const safeContext = {
    path: req.path,
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    userType: req.session?.user?.type,
    approved: req.session?.user?.approved,
  };
  
  if (!req.session?.user || req.session.user.type !== "artist") {
    secureLog.error("Artist access denied", {
      ...safeContext,
      reason: "no_artist_session",
    });
    return res.status(403).json({ message: "Artist access required" });
  }
  
  if (!req.session.user.approved) {
    secureLog.error("Artist not approved", {
      ...safeContext,
      userId: req.session.user.id,
      approved: req.session.user.approved,
    });
    return res.status(403).json({ message: "Account pending approval" });
  }
  
  try {
    const artist = await storage.getArtist(req.session.user.id);
    if (artist) {
      req.user = {
        id: artist.id,
        email: artist.email,
        name: artist.name,
        type: "artist",
        approved: artist.approved
      };
    } else {
      secureLog.warn("Artist lookup failed, using session data", {
        userId: req.session.user.id,
      });
      req.user = req.session.user;
    }
    next();
  } catch (error) {
    secureLog.error("Error loading artist from database", error as Error, {
      userId: req.session.user.id,
    });
    req.user = req.session.user;
    next();
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const safeContext = {
    path: req.path,
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    userType: req.session?.user?.type,
  };
  
  if (!req.session?.user || req.session.user.type !== "admin") {
    secureLog.error("Admin access denied", {
      ...safeContext,
      reason: "no_admin_session",
    });
    return res.status(403).json({ message: "Admin access required" });
  }
  req.user = req.session.user;
  next();
}

export function requireInfluencer(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user || req.session.user.type !== "influencer") {
    return res.status(403).json({ message: "Influencer access required" });
  }
  
  if (req.session.user.status !== "active") {
    return res.status(403).json({ message: "Account pending approval or suspended" });
  }
  
  req.user = req.session.user;
  next();
}
