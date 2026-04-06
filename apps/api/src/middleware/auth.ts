import { Request, Response, NextFunction } from "express";
import { admin } from "../firebase";
import { logger } from "../logger";

export interface AuthUser {
  uid: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const identifier = decoded.email;
    if (!identifier) {
      res.status(401).json({ error: "Token missing email claim" });
      return;
    }
    req.user = { uid: decoded.uid, email: identifier };

    const whitelist = process.env.DEV_WHITELIST;
    if (whitelist) {
      const allowed = whitelist.split(",").map((e) => e.trim().toLowerCase());
      if (!allowed.includes(identifier.toLowerCase())) {
        res.status(403).json({ error: "Not authorized for this environment" });
        return;
      }
    }

    next();
  } catch (err) {
    logger.warn({ err }, "Token verification failed");
    res.status(401).json({ error: "Invalid token" });
  }
}
