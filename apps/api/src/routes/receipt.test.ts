/**
 * Unit tests for the receipt route validation logic.
 * Tests cover: content type validation, receiptStatus guards.
 */

import type { NextFunction, Request, Response } from "express";
import type { Slurp } from "@slurp/types";

const mockInitialGet = jest.fn();
const mockTransactionGet = jest.fn();
const mockTransactionUpdate = jest.fn();
const mockRunTransaction = jest.fn();
const mockGenerateSignedUploadUrl = jest.fn();
const mockDocument = { get: mockInitialGet };
const mockDb = {
  collection: jest.fn(() => ({ doc: jest.fn(() => mockDocument) })),
  runTransaction: mockRunTransaction,
};

jest.mock("../firebase", () => ({ db: mockDb }));
jest.mock("../middleware/auth", () => ({ requireAuth: jest.fn() }));
jest.mock("../middleware/rateLimiter", () => ({
  receiptProcessHourlyLimiter: jest.fn(),
  receiptProcessDailyLimiter: jest.fn(),
}));
jest.mock("../lib/storage", () => ({ generateSignedUploadUrl: mockGenerateSignedUploadUrl }));
jest.mock("../lib/pubsub", () => ({ publishReceiptJob: jest.fn() }));

import receiptRouter from "./receipt";
import { ConflictError } from "../middleware/errorHandler";

// ── Logic extracted from receipt.ts ──────────────────────────────────────────

function isValidContentType(ct: unknown): ct is "image/jpeg" | "image/png" {
  return ct === "image/jpeg" || ct === "image/png";
}

/** upload-url endpoint rejects if already processing */
function canRequestUploadUrl(receiptStatus?: string): boolean {
  return receiptStatus !== "processing";
}

/** process endpoint requires status to be exactly "pending" */
function canTriggerProcessing(receiptStatus?: string): boolean {
  return receiptStatus === "pending";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isValidContentType", () => {
  it("accepts image/jpeg", () => {
    expect(isValidContentType("image/jpeg")).toBe(true);
  });

  it("accepts image/png", () => {
    expect(isValidContentType("image/png")).toBe(true);
  });

  it("rejects image/gif", () => {
    expect(isValidContentType("image/gif")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidContentType("")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidContentType(undefined)).toBe(false);
  });

  it("rejects arbitrary string", () => {
    expect(isValidContentType("application/json")).toBe(false);
  });
});

describe("canRequestUploadUrl", () => {
  it("allows upload when status is undefined", () => {
    expect(canRequestUploadUrl(undefined)).toBe(true);
  });

  it("allows upload when status is pending", () => {
    expect(canRequestUploadUrl("pending")).toBe(true);
  });

  it("allows upload when status is done", () => {
    expect(canRequestUploadUrl("done")).toBe(true);
  });

  it("allows upload when status is failed", () => {
    expect(canRequestUploadUrl("failed")).toBe(true);
  });

  it("blocks upload when status is processing", () => {
    expect(canRequestUploadUrl("processing")).toBe(false);
  });
});

describe("canTriggerProcessing", () => {
  it("allows processing when status is pending", () => {
    expect(canTriggerProcessing("pending")).toBe(true);
  });

  it("blocks processing when status is undefined", () => {
    expect(canTriggerProcessing(undefined)).toBe(false);
  });

  it("blocks processing when status is processing", () => {
    expect(canTriggerProcessing("processing")).toBe(false);
  });

  it("blocks processing when status is done", () => {
    expect(canTriggerProcessing("done")).toBe(false);
  });

  it("blocks processing when status is failed", () => {
    expect(canTriggerProcessing("failed")).toBe(false);
  });
});

type AsyncRouteHandler = (
  request: Request,
  response: Response,
  next: NextFunction
) => Promise<void>;

function uploadUrlHandler(): AsyncRouteHandler {
  const router = receiptRouter as unknown as {
    stack: Array<{
      route?: { path: string; stack: Array<{ handle: AsyncRouteHandler }> };
    }>;
  };
  const layer = router.stack.find((candidate) => candidate.route?.path === "/upload-url");
  const handler = layer?.route?.stack.at(-1)?.handle;
  if (!handler) throw new Error("upload-url route handler not found");
  return handler;
}

function fixedShareSlurp(participantStatus: "pending" | "confirmed"): Slurp {
  return {
    id: "slurp-1",
    inviteToken: "invite-token",
    title: "Dinner",
    hostUid: "host-uid",
    hostEmail: "host@example.com",
    taxAmount: 0,
    tipAmount: 0,
    splitVersion: 2,
    splitRevision: 0,
    items: [],
    participants: [{
      uid: "host-uid",
      email: "host@example.com",
      role: "host",
      status: participantStatus,
      selectedItemIds: [],
      selectedItemShares: {},
    }],
    participantEmails: [],
    removedUids: [],
    currencyConversion: {
      enabled: false,
      billedCurrency: "USD",
      homeCurrency: "USD",
      exchangeRate: 1,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("POST /upload-url transaction recheck", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialGet.mockResolvedValue({ exists: true, data: () => fixedShareSlurp("pending") });
    mockGenerateSignedUploadUrl.mockResolvedValue({
      uploadUrl: "https://storage.example/upload",
      gcsPath: "receipts/slurp-1/receipt.jpg",
    });
    mockRunTransaction.mockImplementation(async (
      operation: (transaction: {
        get: typeof mockTransactionGet;
        update: typeof mockTransactionUpdate;
      }) => Promise<unknown>
    ) => operation({ get: mockTransactionGet, update: mockTransactionUpdate }));
  });

  it("rejects when a participant confirms while the signed URL is generated", async () => {
    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => fixedShareSlurp("confirmed"),
    });
    const response = { json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await uploadUrlHandler()({
      params: { id: "slurp-1" },
      user: { uid: "host-uid", email: "host@example.com" },
      body: { contentType: "image/jpeg" },
    } as unknown as Request, response, next);

    expect(mockGenerateSignedUploadUrl).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  it("commits pending receipt state when the transaction still sees an unlocked slurp", async () => {
    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => fixedShareSlurp("pending"),
    });
    const response = { json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await uploadUrlHandler()({
      params: { id: "slurp-1" },
      user: { uid: "host-uid", email: "host@example.com" },
      body: { contentType: "image/jpeg" },
    } as unknown as Request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receiptStatus: "pending",
        receiptPath: "receipts/slurp-1/receipt.jpg",
      })
    );
    expect(response.json).toHaveBeenCalledWith({
      uploadUrl: "https://storage.example/upload",
      gcsPath: "receipts/slurp-1/receipt.jpg",
    });
  });
});
