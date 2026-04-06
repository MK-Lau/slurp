import rateLimit, { Store, Options, IncrementResponse } from "express-rate-limit";
import type { Request, RequestHandler } from "express";
import { FieldValue } from "@google-cloud/firestore";
import { db } from "../firebase";

const isProd = process.env.ENVIRONMENT === "prod";
const noopLimiter: RequestHandler = (_req, _res, next) => next();

// Firestore-backed store so per-user limits are shared across Cloud Run instances.
// Each rate limit window is a document: rateLimits/{key} → { hits, resetTime (ms epoch) }
class FirestoreStore implements Store {
  private collection: string;
  private windowMs!: number;

  constructor(collection: string) {
    this.collection = collection;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs as number;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const ref = db.collection(this.collection).doc(encodeURIComponent(key));
    const now = Date.now();

    const snap = await ref.get();
    const data = snap.data();

    if (!data || data.resetTime <= now) {
      // Window expired or new key — start a fresh window.
      const resetTime = new Date(now + this.windowMs);
      await ref.set({ hits: 1, resetTime: resetTime.getTime() });
      return { totalHits: 1, resetTime };
    }

    // Window still active — atomically increment without a transaction.
    // Optimistically report hits + 1; slight over-counting under concurrency
    // is acceptable (more restrictive, never more permissive).
    await ref.update({ hits: FieldValue.increment(1) });
    return { totalHits: data.hits + 1, resetTime: new Date(data.resetTime) };
  }

  async decrement(key: string): Promise<void> {
    const ref = db.collection(this.collection).doc(encodeURIComponent(key));
    await ref.update({ hits: FieldValue.increment(-1) });
  }

  async resetKey(key: string): Promise<void> {
    await db.collection(this.collection).doc(encodeURIComponent(key)).delete();
  }
}

// Global per-IP limiter — in-memory is acceptable here; it's a coarse DoS
// guard and adding a Firestore transaction to every request would be too costly.
// Cloud Run sets X-Forwarded-For; trust proxy 1 is set in index.ts.
// Disabled in dev so local testing is not impeded.
export const globalLimiter: RequestHandler = isProd ? rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
}) : noopLimiter;

// Per-user limiter for receipt processing: 15/hour and 60/day.
// Uses Firestore store so the limit is enforced across all instances.
export const receiptProcessHourlyLimiter: RequestHandler = isProd ? rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 15,
  keyGenerator: (req: Request) => req.user?.uid ?? req.ip ?? "anonymous",
  store: new FirestoreStore("rateLimits_receiptProcess_hourly"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many receipt processing requests, try again later" },
}) : noopLimiter;

export const receiptProcessDailyLimiter: RequestHandler = isProd ? rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  limit: 60,
  keyGenerator: (req: Request) => req.user?.uid ?? req.ip ?? "anonymous",
  store: new FirestoreStore("rateLimits_receiptProcess_daily"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many receipt processing requests, try again later" },
}) : noopLimiter;

// Per-user limiter for slurp creation: 10/hour and 30/day.
// Prevents Firestore storage spam via bulk slurp creation.
export const createSlurpHourlyLimiter: RequestHandler = isProd ? rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  keyGenerator: (req: Request) => req.user?.uid ?? req.ip ?? "anonymous",
  store: new FirestoreStore("rateLimits_createSlurp_hourly"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many slurps created, try again later" },
}) : noopLimiter;

export const createSlurpDailyLimiter: RequestHandler = isProd ? rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  limit: 30,
  keyGenerator: (req: Request) => req.user?.uid ?? req.ip ?? "anonymous",
  store: new FirestoreStore("rateLimits_createSlurp_daily"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many slurps created, try again later" },
}) : noopLimiter;

// Per-user limiter for item creation: 200/hour and 600/day.
// Prevents Firestore transaction spam via bulk item creation across slurps.
export const addItemHourlyLimiter: RequestHandler = isProd ? rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 200,
  keyGenerator: (req: Request) => req.user?.uid ?? req.ip ?? "anonymous",
  store: new FirestoreStore("rateLimits_addItem_hourly"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many items added, try again later" },
}) : noopLimiter;

export const addItemDailyLimiter: RequestHandler = isProd ? rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  limit: 600,
  keyGenerator: (req: Request) => req.user?.uid ?? req.ip ?? "anonymous",
  store: new FirestoreStore("rateLimits_addItem_daily"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many items added, try again later" },
}) : noopLimiter;

// Per-user limiter for join requests (20/hour/user).
// Uses Firestore store so the limit is enforced across all instances.
export const joinLimiter: RequestHandler = isProd ? rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  keyGenerator: (req: Request) => req.user?.uid ?? req.ip ?? "anonymous",
  store: new FirestoreStore("rateLimits_join"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many join requests, try again later" },
}) : noopLimiter;
