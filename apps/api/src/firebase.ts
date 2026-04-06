import * as admin from "firebase-admin";
import { Firestore } from "@google-cloud/firestore";

const env = process.env.ENVIRONMENT ?? "local";
const dbName = env === "prod" ? "slurp-prod" : "slurp-dev";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId:
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.GCP_PROJECT,
  });
}

export const db = new Firestore({ databaseId: dbName, ignoreUndefinedProperties: true });
export { admin };
