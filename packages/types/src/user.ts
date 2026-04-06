export interface UserProfile {
  displayName?: string;
  venmoUsername?: string;
  dismissedVenmoPrompt?: boolean;
  blockedUids?: string[];
  preferredCurrency?: string; // 3-letter code, e.g. "USD"; normalized to "USD" if unset
}
