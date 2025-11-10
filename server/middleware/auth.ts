import { Request, Response, NextFunction } from "express";

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

export function requireArtist(req: Request, res: Response, next: NextFunction) {
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
  
  req.user = req.session.user;
  next();
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
  console.log("requireInfluencer middleware:", {
    path: req.path,
    sessionID: req.sessionID,
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    userType: req.session?.user?.type,
    status: req.session?.user?.status,
    cookies: req.headers.cookie ? "present" : "missing",
  });
  
  if (!req.session?.user || req.session.user.type !== "influencer") {
    console.error("Influencer access denied:", {
      path: req.path,
      sessionData: req.session?.user,
    });
    return res.status(403).json({ message: "Influencer access required" });
  }
  
  if (req.session.user.status !== "active") {
    console.error("Influencer not active:", {
      path: req.path,
      status: req.session.user.status,
    });
    return res.status(403).json({ message: "Account pending approval or suspended" });
  }
  
  req.user = req.session.user;
  next();
}
