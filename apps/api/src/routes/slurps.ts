import { Router, Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";
import { randomUUID, timingSafeEqual } from "crypto";
import { db } from "../firebase";
import { FieldValue } from "@google-cloud/firestore";
import type { DocumentReference, DocumentData } from "@google-cloud/firestore";
import { requireAuth } from "../middleware/auth";
import {
  joinLimiter,
  createSlurpHourlyLimiter,
  createSlurpDailyLimiter,
  addItemHourlyLimiter,
  addItemDailyLimiter,
} from "../middleware/rateLimiter";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "../middleware/errorHandler";
import { requireHost, requireParticipant } from "../lib/guards";
import { notifyAll } from "../lib/notify";
import { logger } from "../logger";
import type { Slurp, Item, Participant, CurrencyConversion } from "@slurp/types";
import { computeAllBreakdowns, CURRENCY_MAP, DEFAULT_SLURP_TITLE } from "@slurp/types";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function slurpRef(id: string): DocumentReference<DocumentData> {
  return db.collection("slurps").doc(id);
}

/** Normalize legacy Firestore records that stored percents instead of flat amounts. */
function normalizeSlurp(data: DocumentData): Slurp {
  const d = data as Slurp & { taxPercent?: number; tipPercent?: number };
  if (d.taxAmount == null || d.tipAmount == null) {
    const subtotal = (d.items ?? []).reduce((s: number, i: { price: number }) => s + i.price, 0);
    if (d.taxAmount == null) d.taxAmount = d.taxPercent != null ? Math.round(subtotal * d.taxPercent) / 100 : 0;
    if (d.tipAmount == null) d.tipAmount = d.tipPercent != null ? Math.round(subtotal * d.tipPercent) / 100 : 0;
  }
  if (!d.inviteToken) d.inviteToken = randomUUID();
  if (!d.removedUids) d.removedUids = [];
  if (!d.currencyConversion) {
    d.currencyConversion = { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 };
  }
  return d;
}

/** Strip inviteToken and emails for non-host viewers. Appends viewerEmail and viewerUid. */
function sanitizeSlurpForResponse(slurp: Slurp, viewerUid: string, viewerEmail: string) {
  const isHost = slurp.hostUid === viewerUid;
  if (isHost) return { ...slurp, viewerEmail, viewerUid };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { inviteToken: _token, hostEmail: _hostEmail, ...rest } = slurp;
  const participants = rest.participants.map(({ email: _email, ...p }) => p);
  return { ...rest, participants, viewerEmail, viewerUid };
}

async function getSlurp(id: string): Promise<Slurp> {
  const ref = slurpRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new NotFoundError("Slurp not found");
  const data = snap.data()!;

  // Legacy documents may be missing inviteToken/removedUids. Persist them
  // atomically via a transaction so the token is stable across requests.
  if (!data.inviteToken || !data.removedUids) {
    return db.runTransaction(async (tx) => {
      const txSnap = await tx.get(ref);
      if (!txSnap.exists) throw new NotFoundError("Slurp not found");
      const txData = txSnap.data()!;
      const slurp = normalizeSlurp(txData);
      if (!txData.inviteToken || !txData.removedUids) {
        tx.update(ref, {
          ...(txData.inviteToken ? {} : { inviteToken: slurp.inviteToken }),
          ...(txData.removedUids ? {} : { removedUids: slurp.removedUids }),
        });
      }
      return slurp;
    });
  }

  return normalizeSlurp(data);
}

/** Fetch current displayNames from user profiles in one batched read. */
async function resolveDisplayNames(participants: Participant[]): Promise<Map<string, string>> {
  if (participants.length === 0) return new Map();
  const refs = participants.map((p) => db.collection("users").doc(p.uid));
  const snaps = await db.getAll(...refs);
  const map = new Map<string, string>();
  for (const snap of snaps) {
    const data = snap.data() as { displayName?: string } | undefined;
    if (data?.displayName) map.set(snap.id, data.displayName);
  }
  return map;
}

function validateNonNegative(value: unknown, field: string): number {
  const n = Number(value);
  if (!isFinite(n) || n < 0) throw new BadRequestError(`${field} must be a non-negative number`);
  return n;
}

function validateTaxTip(body: Record<string, unknown>): Partial<Pick<Slurp, "taxAmount" | "tipAmount">> {
  const result: Partial<Pick<Slurp, "taxAmount" | "tipAmount">> = {};
  if (body.taxAmount != null) result.taxAmount = validateNonNegative(body.taxAmount, "taxAmount");
  if (body.tipAmount != null) result.tipAmount = validateNonNegative(body.tipAmount, "tipAmount");
  return result;
}

function validatePrice(value: unknown): number {
  const n = Number(value);
  if (!isFinite(n) || n < 0) throw new BadRequestError("price must be a non-negative number");
  return n;
}

function validateString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new BadRequestError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new BadRequestError(`${field} must be ${maxLength} characters or fewer`);
  return trimmed;
}

function validateCurrencyConversion(body: Record<string, unknown>): CurrencyConversion | undefined {
  const raw = body.currencyConversion;
  if (raw == null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestError("currencyConversion must be an object");
  }
  const cc = raw as Record<string, unknown>;
  const enabled = Boolean(cc.enabled);
  const billedCurrency = cc.billedCurrency;
  const homeCurrency = cc.homeCurrency;
  const exchangeRate = Number(cc.exchangeRate);
  if (typeof billedCurrency !== "string" || !CURRENCY_MAP[billedCurrency]) {
    throw new BadRequestError("currencyConversion.billedCurrency must be a valid 3-letter currency code");
  }
  if (typeof homeCurrency !== "string" || !CURRENCY_MAP[homeCurrency]) {
    throw new BadRequestError("currencyConversion.homeCurrency must be a valid 3-letter currency code");
  }
  if (!isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new BadRequestError("currencyConversion.exchangeRate must be a positive number");
  }
  if (enabled && billedCurrency === homeCurrency) {
    throw new BadRequestError("currencyConversion.billedCurrency and homeCurrency must be different when conversion is enabled");
  }
  return { enabled, billedCurrency, homeCurrency, exchangeRate };
}

/** Reset every participant's confirmed status to pending (call when slurp content changes). */
function resetConfirmations(slurp: Slurp): void {
  for (const p of slurp.participants) {
    p.status = "pending";
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /slurps — list slurps for current user
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uid, email } = req.user;
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
      const cursorCreated = req.query.cursorCreated as string | undefined;
      const cursorInvited = req.query.cursorInvited as string | undefined;

      const col = db.collection("slurps");

      let createdQuery = col
        .where("hostUid", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(limit + 1);
      if (cursorCreated) createdQuery = createdQuery.startAfter(cursorCreated) as typeof createdQuery;

      let invitedQuery = col
        .where("participantEmails", "array-contains", email)
        .orderBy("createdAt", "desc")
        .limit(limit + 1);
      if (cursorInvited) invitedQuery = invitedQuery.startAfter(cursorInvited) as typeof invitedQuery;

      const [hostedSnap, invitedSnap] = await Promise.all([createdQuery.get(), invitedQuery.get()]);

      const hostedDocs = hostedSnap.docs;
      const hasMoreCreated = hostedDocs.length > limit;
      const createdDocs = hasMoreCreated ? hostedDocs.slice(0, limit) : hostedDocs;
      const created = createdDocs
        .map((d) => normalizeSlurp(d.data()!))
        .map((d) => sanitizeSlurpForResponse(d, uid, email));

      const hostedIds = new Set(hostedSnap.docs.map((d) => d.id));
      const filteredInvitedDocs = invitedSnap.docs.filter((d) => !hostedIds.has(d.id));
      const hasMoreInvited = filteredInvitedDocs.length > limit;
      const invitedDocs = hasMoreInvited ? filteredInvitedDocs.slice(0, limit) : filteredInvitedDocs;
      const invited = invitedDocs
        .map((d) => normalizeSlurp(d.data()!))
        .map((d) => sanitizeSlurpForResponse(d, uid, email));

      res.json({
        created,
        invited,
        nextCursorCreated: hasMoreCreated ? created[created.length - 1].createdAt : undefined,
        nextCursorInvited: hasMoreInvited ? invited[invited.length - 1].createdAt : undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /slurps — create
router.post(
  "/",
  requireAuth,
  createSlurpHourlyLimiter,
  createSlurpDailyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let title = DEFAULT_SLURP_TITLE;
      if (req.body.title != null) title = validateString(req.body.title, "title", 64) || DEFAULT_SLURP_TITLE;
      const taxTip = validateTaxTip(req.body);
      const taxAmount = taxTip.taxAmount ?? 0;
      const tipAmount = taxTip.tipAmount ?? 0;
      const currencyConversion = validateCurrencyConversion(req.body) ?? { enabled: false, billedCurrency: "USD", homeCurrency: "USD", exchangeRate: 1 };
      const now = new Date().toISOString();
      const hostProfileSnap = await db.collection("users").doc(req.user.uid).get();
      const hostProfile = hostProfileSnap.data() as { displayName?: string } | undefined;
      const hostParticipant: Participant = {
        uid: req.user.uid,
        email: req.user.email,
        role: "host",
        status: "pending",
        selectedItemIds: [],
      };
      if (hostProfile?.displayName) hostParticipant.displayName = hostProfile.displayName;
      const slurp: Slurp = {
        id: nanoid(),
        title,
        hostUid: req.user.uid,
        hostEmail: req.user.email,
        taxAmount,
        tipAmount,
        items: [],
        participants: [hostParticipant],
        participantEmails: [req.user.email],
        inviteToken: randomUUID(),
        removedUids: [],
        currencyConversion,
        createdAt: now,
        updatedAt: now,
      };
      await slurpRef(slurp.id).set(slurp);
      logger.info({ message: "slurp_created", slurpId: slurp.id });
      res.status(201).json(slurp);
    } catch (err) {
      next(err);
    }
  }
);

// GET /slurps/:id/preview — public, no auth, returns preview for invite link
// NOTE: Must be declared before GET /:id so Express matches /preview before :id.
router.get(
  "/:id/preview",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.query;
      const slurp = await getSlurp(req.params.id);
      const tokenStr = typeof token === "string" ? token : "";
      const tokensMatch = tokenStr.length === slurp.inviteToken.length &&
        timingSafeEqual(Buffer.from(tokenStr), Buffer.from(slurp.inviteToken));
      if (!tokensMatch) {
        res.status(401).json({ error: "Invalid invite token" });
        return;
      }
      const host = slurp.participants.find((p) => p.role === "host");
      const hostDisplayName = host?.displayName ?? "the host";
      res.json({
        title: slurp.title,
        hostDisplayName,
        participantCount: slurp.participants.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /slurps/:id/og — intentionally public, no auth. Returns only title and
// host display name for Open Graph / iMessage link previews. Access is gated
// in practice by the unguessable nanoid() slurp ID.
router.get(
  "/:id/og",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slurp = await getSlurp(req.params.id);
      const host = slurp.participants.find((p) => p.role === "host");
      const hostName = host?.displayName ?? host?.email?.split("@")[0] ?? "Someone";
      res.json({ title: slurp.title, hostName });
    } catch (err) {
      next(err);
    }
  }
);

// GET /slurps/:id
router.get(
  "/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slurp = await getSlurp(req.params.id);
      requireParticipant(slurp, req.user.uid);
      const displayNames = await resolveDisplayNames(slurp.participants);
      for (const p of slurp.participants) {
        const name = displayNames.get(p.uid);
        if (name) p.displayName = name;
      }
      res.json(sanitizeSlurpForResponse(slurp, req.user.uid, req.user.email));
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /slurps/:id — update title/tax/tip
router.patch(
  "/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = normalizeSlurp(snap.data()!);
        requireHost(slurp, req.user.uid);
        const { title } = req.body;
        if (title != null) slurp.title = validateString(title, "title", 64);
        let costChanged = false;
        if (req.body.taxAmount != null || req.body.tipAmount != null) {
          const taxTip = validateTaxTip(req.body);
          if (taxTip.taxAmount != null) { slurp.taxAmount = taxTip.taxAmount; costChanged = true; }
          if (taxTip.tipAmount != null) { slurp.tipAmount = taxTip.tipAmount; costChanged = true; }
        }
        const currencyConversion = validateCurrencyConversion(req.body);
        if (currencyConversion != null) slurp.currencyConversion = currencyConversion;
        // Only reset confirmations when amounts owed actually change, not for display-only updates
        if (costChanged) resetConfirmations(slurp);
        slurp.updatedAt = new Date().toISOString();
        tx.set(ref, slurp);
        return slurp;
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /slurps/:id/items — add item
router.post(
  "/:id/items",
  requireAuth,
  addItemHourlyLimiter,
  addItemDailyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = normalizeSlurp(snap.data()!);
        requireHost(slurp, req.user.uid);
        const { name } = req.body;
        if (!name) throw new BadRequestError("name is required");
        validateString(name, "name", 64);
        const price = validatePrice(req.body.price);
        if (slurp.items.length >= 20) throw new BadRequestError("Maximum 20 items");
        slurp.items.push({ id: nanoid(), name, price });
        resetConfirmations(slurp);
        slurp.updatedAt = new Date().toISOString();
        tx.set(ref, slurp);
        return slurp;
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /slurps/:id/items/:itemId — edit item
router.patch(
  "/:id/items/:itemId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = normalizeSlurp(snap.data()!);
        requireHost(slurp, req.user.uid);
        const item = slurp.items.find((i: Item) => i.id === req.params.itemId);
        if (!item) throw new NotFoundError("Item not found");
        const { name } = req.body;
        if (name != null) item.name = validateString(name, "name", 64);
        if (req.body.price != null) item.price = validatePrice(req.body.price);
        resetConfirmations(slurp);
        slurp.updatedAt = new Date().toISOString();
        tx.set(ref, slurp);
        return slurp;
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /slurps/:id/items/:itemId
router.delete(
  "/:id/items/:itemId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = normalizeSlurp(snap.data()!);
        requireHost(slurp, req.user.uid);
        const { itemId } = req.params;
        slurp.items = slurp.items.filter((i: Item) => i.id !== itemId);
        for (const p of slurp.participants) {
          p.selectedItemIds = p.selectedItemIds.filter((id) => id !== itemId);
        }
        resetConfirmations(slurp);
        slurp.updatedAt = new Date().toISOString();
        tx.set(ref, slurp);
        return slurp;
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /slurps/:id/join
router.post(
  "/:id/join",
  requireAuth,
  joinLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = normalizeSlurp(snap.data()!);
        const { inviteToken, displayName: rawDisplayName } = req.body as { inviteToken: string; displayName?: string };
        const displayName = rawDisplayName !== undefined ? validateString(rawDisplayName, "displayName", 40) || undefined : undefined;

        if (!inviteToken) throw new ForbiddenError("Invalid invite token");
        const inviteTokensMatch = inviteToken.length === slurp.inviteToken.length &&
          timingSafeEqual(Buffer.from(inviteToken), Buffer.from(slurp.inviteToken));
        if (!inviteTokensMatch) {
          throw new ForbiddenError("Invalid invite token");
        }

        if (slurp.removedUids.includes(req.user.uid)) {
          throw new ForbiddenError("You have been removed from this slurp");
        }

        // Check if already a participant — idempotent
        const existing = slurp.participants.find((p: Participant) => p.uid === req.user.uid);
        if (existing) return slurp;

        if (slurp.participants.length >= 10) throw new BadRequestError("This slurp is full");

        // Check host's blocked list and fetch joining user's profile for displayName fallback
        const hostSnap = await tx.get(db.collection("users").doc(slurp.hostUid));
        const joinerSnap = await tx.get(db.collection("users").doc(req.user.uid));
        const hostProfile = hostSnap.data() as { blockedUids?: string[] } | undefined;
        if (hostProfile?.blockedUids?.includes(req.user.uid)) {
          throw new ForbiddenError("You cannot join slurps by this host");
        }
        const joinerProfile = joinerSnap.data() as { displayName?: string } | undefined;

        const newParticipant: Participant = {
          uid: req.user.uid,
          email: req.user.email,
          role: "guest",
          status: "pending",
          selectedItemIds: [],
        };
        const resolvedDisplayName = displayName || joinerProfile?.displayName;
        if (resolvedDisplayName) newParticipant.displayName = resolvedDisplayName;

        slurp.participants.push(newParticipant);
        if (!slurp.participantEmails) slurp.participantEmails = [];
        if (!slurp.participantEmails.includes(req.user.email)) {
          slurp.participantEmails.push(req.user.email);
        }
        slurp.updatedAt = new Date().toISOString();
        tx.set(ref, slurp);
        return slurp;
      });
      res.json(sanitizeSlurpForResponse(result, req.user.uid, req.user.email));
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /slurps/:id/participants/:participantUid — host only
router.delete(
  "/:id/participants/:participantUid",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      const { participantUid } = req.params;
      const { block } = req.body as { block?: boolean };

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = normalizeSlurp(snap.data()!);
        requireHost(slurp, req.user.uid);

        if (participantUid === req.user.uid) {
          throw new BadRequestError("Host cannot remove themselves");
        }

        const participantIndex = slurp.participants.findIndex((p: Participant) => p.uid === participantUid);
        if (participantIndex === -1) throw new NotFoundError("Participant not found");

        const removed = slurp.participants[participantIndex];
        slurp.participants.splice(participantIndex, 1);
        slurp.participantEmails = slurp.participantEmails.filter(
          (e) => e !== removed.email
        );
        slurp.removedUids.push(participantUid);
        resetConfirmations(slurp);
        slurp.updatedAt = new Date().toISOString();
        tx.set(ref, slurp);

        // Block write is inside the transaction so it's atomic with the removal.
        if (block) {
          const userRef = db.collection("users").doc(req.user.uid);
          tx.set(userRef, { blockedUids: FieldValue.arrayUnion(participantUid) }, { merge: true });
        }

        return slurp;
      });

      res.json(sanitizeSlurpForResponse(result, req.user.uid, req.user.email));
    } catch (err) {
      next(err);
    }
  }
);

// PUT /slurps/:id/selections
router.put(
  "/:id/selections",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = normalizeSlurp(snap.data()!);
        const p = requireParticipant(slurp, req.user.uid);
        const { selectedItemIds } = req.body as { selectedItemIds: string[] };
        if (!Array.isArray(selectedItemIds)) {
          throw new BadRequestError("selectedItemIds array is required");
        }
        const validIds = new Set(slurp.items.map((i: Item) => i.id));
        for (const id of selectedItemIds) {
          if (!validIds.has(id)) throw new BadRequestError(`Unknown item id: ${id}`);
        }
        p.selectedItemIds = selectedItemIds;
        p.status = "pending";
        slurp.updatedAt = new Date().toISOString();
        tx.set(ref, slurp);
        return slurp;
      });
      res.json(sanitizeSlurpForResponse(result, req.user.uid, req.user.email));
    } catch (err) {
      next(err);
    }
  }
);

// POST /slurps/:id/confirm
router.post(
  "/:id/confirm",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      let shouldNotify = false;
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = normalizeSlurp(snap.data()!);
        const p = requireParticipant(slurp, req.user.uid);
        p.status = "confirmed";
        const allConfirmed = slurp.participants.every((p: Participant) => p.status === "confirmed");
        const allItemsAccountedFor = slurp.items.every((item: Item) =>
          slurp.participants.some((p: Participant) => p.selectedItemIds.includes(item.id))
        );
        if (allConfirmed && allItemsAccountedFor) {
          shouldNotify = true;
        }
        slurp.updatedAt = new Date().toISOString();
        tx.set(ref, slurp);
        return slurp;
      });
      if (shouldNotify) await notifyAll(result);
      res.json(sanitizeSlurpForResponse(result, req.user.uid, req.user.email));
    } catch (err) {
      next(err);
    }
  }
);

// GET /slurps/:id/summary
router.get(
  "/:id/summary",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slurp = await getSlurp(req.params.id);
      requireParticipant(slurp, req.user.uid);

      const [displayNames, hostSnap] = await Promise.all([
        resolveDisplayNames(slurp.participants),
        db.collection("users").doc(slurp.hostUid).get(),
      ]);
      const hostProfile = hostSnap.data() as { venmoUsername?: string } | undefined;

      const breakdowns = computeAllBreakdowns(slurp);
      const participants = breakdowns.map((b) => {
        const p = slurp.participants.find((p: Participant) => p.uid === b.uid);
        const displayName = displayNames.get(b.uid);
        return { ...b, ...(displayName ? { displayName } : {}), paid: p?.paid ?? false };
      });

      res.json({
        slurpId: slurp.id,
        participants,
        hostVenmoUsername: hostProfile?.venmoUsername,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /slurps/:id/receipt-warning/dismiss — host only
router.post(
  "/:id/receipt-warning/dismiss",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) throw new NotFoundError("Slurp not found");
      const slurp = normalizeSlurp(snap.data()!);
      requireHost(slurp, req.user.uid);
      await ref.update({ receiptWarningDismissed: true, updatedAt: new Date().toISOString() });
      slurp.receiptWarningDismissed = true;
      res.json(sanitizeSlurpForResponse(slurp, req.user.uid, req.user.email));
    } catch (err) {
      next(err);
    }
  }
);

// POST /slurps/:id/pay
router.post(
  "/:id/pay",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ref = slurpRef(req.params.id);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new NotFoundError("Slurp not found");
        const slurp = normalizeSlurp(snap.data()!);
        const p = requireParticipant(slurp, req.user.uid);
        if (p.role === "host") throw new BadRequestError("Host cannot mark as paid");
        p.paid = true;
        slurp.updatedAt = new Date().toISOString();
        tx.set(ref, slurp);
        return slurp;
      });
      res.json(sanitizeSlurpForResponse(result, req.user.uid, req.user.email));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
