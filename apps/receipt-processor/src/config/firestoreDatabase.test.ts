import { resolveFirestoreDatabase } from "./firestoreDatabase";

describe("resolveFirestoreDatabase (receipt-processor)", () => {
  it("explicit FIRESTORE_DATABASE wins over ENVIRONMENT=prod", () => {
    expect(resolveFirestoreDatabase({ FIRESTORE_DATABASE: "(default)", ENVIRONMENT: "prod" })).toBe("(default)");
  });

  it("explicit FIRESTORE_DATABASE wins over ENVIRONMENT=dev/e2e", () => {
    expect(resolveFirestoreDatabase({ FIRESTORE_DATABASE: "(default)", ENVIRONMENT: "e2e" })).toBe("(default)");
  });

  it("uses slurp-prod when ENVIRONMENT=prod and no explicit database", () => {
    expect(resolveFirestoreDatabase({ ENVIRONMENT: "prod" })).toBe("slurp-prod");
  });

  it("uses slurp-dev when ENVIRONMENT is dev/local/e2e/missing and no explicit database", () => {
    expect(resolveFirestoreDatabase({ ENVIRONMENT: "dev" })).toBe("slurp-dev");
    expect(resolveFirestoreDatabase({ ENVIRONMENT: "local" })).toBe("slurp-dev");
    expect(resolveFirestoreDatabase({ ENVIRONMENT: "e2e" })).toBe("slurp-dev");
    expect(resolveFirestoreDatabase({})).toBe("slurp-dev");
  });

  it("trims whitespace and treats empty explicit as absent", () => {
    expect(resolveFirestoreDatabase({ FIRESTORE_DATABASE: "  ", ENVIRONMENT: "prod" })).toBe("slurp-prod");
  });
});
