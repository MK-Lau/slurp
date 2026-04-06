import { Firestore } from "@google-cloud/firestore";

const env = process.env.ENVIRONMENT ?? "dev";
const dbName = env === "prod" ? "slurp-prod" : "slurp-dev";
const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT;

export const db = new Firestore({ projectId, databaseId: dbName });
