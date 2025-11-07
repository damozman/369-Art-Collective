import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        type: "artist" | "admin";
        approved?: boolean;
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
  if (!req.session?.user || req.session.user.type !== "artist") {
    return res.status(403).json({ message: "Artist access required" });
  }
  
  if (!req.session.user.approved) {
    return res.status(403).json({ message: "Account pending approval" });
  }
  
  req.user = req.session.user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  console.log("requireAdmin check:", {
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    userType: req.session?.user?.type,
    userId: req.session?.user?.id,
  });
  
  if (!req.session?.user || req.session.user.type !== "admin") {
    console.log("Admin auth failed - session:", req.session?.user);
    return res.status(403).json({ message: "Admin access required" });
  }
  req.user = req.session.user;
  next();
}
