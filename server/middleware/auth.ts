import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

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
  console.log("requireArtist middleware:", {
    path: req.path,
    sessionID: req.sessionID,
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    userType: req.session?.user?.type,
    approved: req.session?.user?.approved,
    cookies: req.headers.cookie ? "present" : "missing",
  });
  
  if (!req.session?.user || req.session.user.type !== "artist") {
    console.error("Artist access denied:", {
      path: req.path,
      sessionData: req.session?.user,
    });
    return res.status(403).json({ message: "Artist access required" });
  }
  
  if (!req.session.user.approved) {
    console.error("Artist not approved:", {
      path: req.path,
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
      console.warn("Artist lookup failed, falling back to session data:", req.session.user.id);
      req.user = req.session.user;
    }
    next();
  } catch (error) {
    console.error("Error loading artist:", error);
    req.user = req.session.user;
    next();
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  console.log("requireAdmin middleware:", {
    path: req.path,
    sessionID: req.sessionID,
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    userType: req.session?.user?.type,
    cookies: req.headers.cookie ? "present" : "missing",
  });
  
  if (!req.session?.user || req.session.user.type !== "admin") {
    console.error("Admin access denied:", {
      path: req.path,
      sessionData: req.session?.user,
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
