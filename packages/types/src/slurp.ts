export const DEFAULT_SLURP_TITLE = "Unnamed Slurp";

/** Hard cap on participants in one slurp, host included. */
export const MAX_PARTICIPANTS = 10;

export type ParticipantRole = "host" | "guest";
export type ParticipantStatus = "pending" | "confirmed";

export interface Item {
  id: string;
  name: string;
  price: number;
  /** Fixed equal portions for splitVersion 2 slurps. Absent on legacy records. */
  shareCount?: number;
}

export interface Participant {
  uid: string;
  email?: string;
  displayName?: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  selectedItemIds: string[];
  /** Number of fixed portions claimed per item for splitVersion 2 slurps. */
  selectedItemShares?: Record<string, number>;
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
  /** Version 2 uses host-defined fixed shares. Absent means legacy selector-count splitting. */
  splitVersion?: 2;
  /** Increments whenever a version 2 financial configuration changes. */
  splitRevision?: number;
  /** One-time marker for removing the former implicit one-share default. */
  openSplitDefaultsMigrated?: boolean;
  expectedGuests?: number; // guests besides the host; absent = not specified
  items: Item[];
  participants: Participant[];
  participantEmails: string[]; // guest emails only (excludes host); denormalized for Firestore array-contains queries
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
