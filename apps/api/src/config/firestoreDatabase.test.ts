import { resolveFirestoreDatabase } from "./firestoreDatabase";

describe("resolveFirestoreDatabase (api)", () => {
  it("explicit FIRESTORE_DATABASE wins over ENVIRONMENT=prod", () => {
    expect(resolveFirestoreDatabase({ FIRESTORE_DATABASE: "(default)", ENVIRONMENT: "prod" })).toBe("(default)");
  });

  it("explicit FIRESTORE_DATABASE wins over ENVIRONMENT=dev", () => {
    expect(resolveFirestoreDatabase({ FIRESTORE_DATABASE: "custom-db", ENVIRONMENT: "dev" })).toBe("custom-db");
  });

  it("uses slurp-prod when ENVIRONMENT=prod and no explicit database", () => {
    expect(resolveFirestoreDatabase({ ENVIRONMENT: "prod" })).toBe("slurp-prod");
  });

  it("uses slurp-dev when ENVIRONMENT=dev and no explicit database", () => {
    expect(resolveFirestoreDatabase({ ENVIRONMENT: "dev" })).toBe("slurp-dev");
  });

  it("uses slurp-dev when ENVIRONMENT is missing and no explicit database", () => {
    expect(resolveFirestoreDatabase({})).toBe("slurp-dev");
  });

  it("uses slurp-dev when ENVIRONMENT=local and no explicit database", () => {
    expect(resolveFirestoreDatabase({ ENVIRONMENT: "local" })).toBe("slurp-dev");
  });

  it("uses slurp-dev when ENVIRONMENT=e2e and no explicit database", () => {
    expect(resolveFirestoreDatabase({ ENVIRONMENT: "e2e" })).toBe("slurp-dev");
  });

  it("trims whitespace and treats empty explicit as absent", () => {
    expect(resolveFirestoreDatabase({ FIRESTORE_DATABASE: "   ", ENVIRONMENT: "prod" })).toBe("slurp-prod");
  });
});
