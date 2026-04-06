import type { Slurp, Item, CurrencyConversion } from "./slurp";
import type { UserProfile } from "./user";

// GET /slurps
export interface ListSlurpsResponse {
  created: Slurp[];
  invited: Slurp[];
  nextCursorCreated?: string;
  nextCursorInvited?: string;
}

// POST /slurps
export interface CreateSlurpRequest {
  title: string;
  taxAmount?: number;
  tipAmount?: number;
  currencyConversion?: CurrencyConversion;
}
export type CreateSlurpResponse = Slurp;

// GET /slurps/:id
export interface GetSlurpResponse extends Slurp {
  viewerEmail: string;
  viewerUid: string;
}

// PATCH /slurps/:id
export interface UpdateSlurpRequest {
  title?: string;
  taxAmount?: number;
  tipAmount?: number;
  currencyConversion?: CurrencyConversion;
}
export type UpdateSlurpResponse = Slurp;

// POST /slurps/:id/items
export interface AddItemRequest {
  name: string;
  price: number;
}
export type AddItemResponse = Slurp;

// PATCH /slurps/:id/items/:itemId
export interface UpdateItemRequest {
  name?: string;
  price?: number;
}
export type UpdateItemResponse = Slurp;

// DELETE /slurps/:id/items/:itemId
export type DeleteItemResponse = Slurp;

// GET /slurps/:id/preview
export interface SlurpPreviewResponse {
  title: string;
  hostDisplayName: string;
  participantCount: number;
}

// POST /slurps/:id/join
export interface JoinSlurpRequest {
  inviteToken: string;
  displayName?: string;
}
export type JoinResponse = GetSlurpResponse;

// DELETE /slurps/:id/participants/:participantUid
export interface RemoveParticipantRequest {
  block?: boolean;
}

// PUT /slurps/:id/selections
export interface UpdateSelectionsRequest {
  selectedItemIds: string[];
}
export type UpdateSelectionsResponse = GetSlurpResponse;

// POST /slurps/:id/confirm
export type ConfirmResponse = GetSlurpResponse;

// GET /slurps/:id/summary
export interface ParticipantSummary {
  email?: string;
  uid: string;
  displayName?: string;
  items: Array<{ item: Item; sharePrice: number }>;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  paid?: boolean;
}
export interface SummaryResponse {
  slurpId: string;
  participants: ParticipantSummary[];
  hostVenmoUsername?: string;
}

// POST /slurps/:id/receipt/upload-url
export interface ReceiptUploadUrlRequest {
  contentType: "image/jpeg" | "image/png";
}
export interface ReceiptUploadUrlResponse {
  uploadUrl: string;
  gcsPath: string;
}

// POST /slurps/:id/receipt/process
export interface ReceiptProcessRequest {
  gcsPath: string;
}
export interface ReceiptProcessResponse {
  id: string;
  receiptStatus: string;
}

// GET /profile
export type GetProfileResponse = UserProfile;

// PUT /profile
export interface UpdateProfileRequest {
  displayName?: string;
  venmoUsername?: string;
  dismissedVenmoPrompt?: boolean;
  preferredCurrency?: string;
}
export type UpdateProfileResponse = UserProfile;
