export function resolveFirestoreDatabase(env: {
  FIRESTORE_DATABASE?: string;
  ENVIRONMENT?: string;
}): string {
  const explicit = env.FIRESTORE_DATABASE?.trim();
  if (explicit) return explicit;
  return env.ENVIRONMENT === "prod" ? "slurp-prod" : "slurp-dev";
}
