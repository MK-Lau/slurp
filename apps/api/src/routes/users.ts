import { Router, Request, Response, NextFunction } from "express";
import { db } from "../firebase";
import { requireAuth } from "../middleware/auth";
import { BadRequestError } from "../middleware/errorHandler";
import type { UserProfile } from "@slurp/types";
import { CURRENCY_MAP } from "@slurp/types";

const router = Router();

// GET /profile
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const snap = await db.collection("users").doc(req.user.uid!).get();
      const profile = (snap.data() as UserProfile) ?? {};
      if (!profile.preferredCurrency) profile.preferredCurrency = "USD";
      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /profile
router.put(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { displayName, venmoUsername, dismissedVenmoPrompt, preferredCurrency } = req.body as Partial<UserProfile>;
      const update: Partial<UserProfile> = {};
      if (displayName !== undefined) {
        if (typeof displayName !== "string") {
          throw new BadRequestError("displayName must be between 3 and 40 characters");
        }
        const trimmedName = displayName.trim();
        if (trimmedName.length < 3 || trimmedName.length > 40) {
          throw new BadRequestError("displayName must be between 3 and 40 characters");
        }
        update.displayName = trimmedName;
      }
      if (venmoUsername !== undefined) {
        if (typeof venmoUsername !== "string") {
          throw new BadRequestError("venmoUsername must be a string of 50 characters or fewer");
        }
        const trimmedVenmo = venmoUsername.trim();
        if (trimmedVenmo.length > 50) {
          throw new BadRequestError("venmoUsername must be a string of 50 characters or fewer");
        }
        if (/\s/.test(trimmedVenmo)) {
          throw new BadRequestError("venmoUsername must not contain spaces");
        }
        update.venmoUsername = trimmedVenmo;
      }
      if (dismissedVenmoPrompt !== undefined) update.dismissedVenmoPrompt = dismissedVenmoPrompt;
      if (preferredCurrency !== undefined) {
        if (typeof preferredCurrency !== "string" || !CURRENCY_MAP[preferredCurrency]) {
          throw new BadRequestError("preferredCurrency must be a valid 3-letter currency code");
        }
        update.preferredCurrency = preferredCurrency;
      }
      await db.collection("users").doc(req.user.uid!).set(update, { merge: true });
      const snap = await db.collection("users").doc(req.user.uid!).get();
      const profile = (snap.data() as UserProfile) ?? {};
      if (!profile.preferredCurrency) profile.preferredCurrency = "USD";
      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
