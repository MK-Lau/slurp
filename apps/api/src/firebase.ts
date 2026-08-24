import * as admin from "firebase-admin";
import { Firestore } from "@google-cloud/firestore";
import { resolveFirestoreDatabase } from "./config/firestoreDatabase";

const dbName = resolveFirestoreDatabase(process.env);
const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT;

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

export const db = new Firestore({
  projectId,
  databaseId: dbName,
  ignoreUndefinedProperties: true,
});
export { admin };
