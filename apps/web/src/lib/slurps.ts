import type {
  Slurp,
  GetSlurpResponse,
  ListSlurpsResponse,
  CreateSlurpRequest,
  UpdateSlurpRequest,
  AddItemRequest,
  UpdateItemRequest,
  JoinSlurpRequest,
  SlurpPreviewResponse,
  UpdateSelectionsRequest,
  SummaryResponse,
  ReceiptUploadUrlRequest,
  ReceiptUploadUrlResponse,
  ReceiptProcessResponse,
} from "@slurp/types";
import { apiFetch } from "./api";

export const listSlurps = (params?: { limit?: number; cursorCreated?: string; cursorInvited?: string }): Promise<ListSlurpsResponse> => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursorCreated) qs.set("cursorCreated", params.cursorCreated);
  if (params?.cursorInvited) qs.set("cursorInvited", params.cursorInvited);
  const query = qs.toString();
  return apiFetch<ListSlurpsResponse>(`/slurps${query ? `?${query}` : ""}`);
};

export const createSlurp = (body: CreateSlurpRequest): Promise<Slurp> =>
  apiFetch<Slurp>("/slurps", { method: "POST", body: JSON.stringify(body) });

export const getSlurp = (id: string): Promise<GetSlurpResponse> =>
  apiFetch<GetSlurpResponse>(`/slurps/${id}`);

export const getSlurpPreview = (id: string, token: string): Promise<SlurpPreviewResponse> =>
  apiFetch<SlurpPreviewResponse>(`/slurps/${id}/preview?token=${encodeURIComponent(token)}`);

export const updateSlurp = (id: string, body: UpdateSlurpRequest): Promise<Slurp> =>
  apiFetch<Slurp>(`/slurps/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const addItem = (id: string, body: AddItemRequest): Promise<Slurp> =>
  apiFetch<Slurp>(`/slurps/${id}/items`, { method: "POST", body: JSON.stringify(body) });

export const updateItem = (id: string, itemId: string, body: UpdateItemRequest): Promise<Slurp> =>
  apiFetch<Slurp>(`/slurps/${id}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteItem = (id: string, itemId: string): Promise<Slurp> =>
  apiFetch<Slurp>(`/slurps/${id}/items/${itemId}`, { method: "DELETE" });

export const joinSlurp = (id: string, body: JoinSlurpRequest): Promise<GetSlurpResponse> =>
  apiFetch<GetSlurpResponse>(`/slurps/${id}/join`, { method: "POST", body: JSON.stringify(body) });

export const removeParticipant = (id: string, participantUid: string, block?: boolean): Promise<GetSlurpResponse> =>
  apiFetch<GetSlurpResponse>(`/slurps/${id}/participants/${participantUid}`, {
    method: "DELETE",
    body: JSON.stringify({ block: block ?? false }),
  });

export const updateSelections = (id: string, body: UpdateSelectionsRequest): Promise<GetSlurpResponse> =>
  apiFetch<GetSlurpResponse>(`/slurps/${id}/selections`, { method: "PUT", body: JSON.stringify(body) });

export const confirmSlurp = (id: string): Promise<GetSlurpResponse> =>
  apiFetch<GetSlurpResponse>(`/slurps/${id}/confirm`, { method: "POST" });

export const getSummary = (id: string): Promise<SummaryResponse> =>
  apiFetch<SummaryResponse>(`/slurps/${id}/summary`);

export const markAsPaid = (id: string): Promise<GetSlurpResponse> =>
  apiFetch<GetSlurpResponse>(`/slurps/${id}/pay`, { method: "POST" });

export const getReceiptUploadUrl = (
  id: string,
  body: ReceiptUploadUrlRequest
): Promise<ReceiptUploadUrlResponse> =>
  apiFetch<ReceiptUploadUrlResponse>(`/slurps/${id}/receipt/upload-url`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const dismissReceiptWarning = (id: string): Promise<Slurp> =>
  apiFetch<Slurp>(`/slurps/${id}/receipt-warning/dismiss`, { method: "POST" });

export const triggerReceiptProcessing = (
  id: string,
  gcsPath: string
): Promise<ReceiptProcessResponse> =>
  apiFetch<ReceiptProcessResponse>(`/slurps/${id}/receipt/process`, {
    method: "POST",
    body: JSON.stringify({ gcsPath }),
  });
