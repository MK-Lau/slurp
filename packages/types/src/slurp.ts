export const DEFAULT_SLURP_TITLE = "Unnamed Slurp";

export type ParticipantRole = "host" | "guest";
export type ParticipantStatus = "pending" | "confirmed";

export interface Item {
  id: string;
  name: string;
  price: number;
}

export interface Participant {
  uid: string;
  email?: string;
  displayName?: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  selectedItemIds: string[];
  paid?: boolean;
}

export interface CurrencyConversion {
  enabled: boolean;
  billedCurrency: string; // 3-letter code, e.g. "JPY"
  homeCurrency: string; // 3-letter code, e.g. "USD"
  exchangeRate: number; // billed units per 1 home unit, e.g. 150 means 1 USD = ¥150
}

export interface Slurp {
  id: string;
  title: string;
  hostUid: string;
  hostEmail?: string;
  taxAmount: number;
  tipAmount: number;
  items: Item[];
  participants: Participant[];
  participantEmails: string[]; // denormalized for Firestore array-contains queries
  inviteToken: string;
  removedUids: string[];
  receiptStatus?: "pending" | "processing" | "done" | "failed";
  receiptPath?: string;
  receiptError?: string;
  receiptWarning?: string;
  receiptWarningDismissed?: boolean;
  currencyConversion: CurrencyConversion;
  createdAt: string;
  updatedAt: string;
}
