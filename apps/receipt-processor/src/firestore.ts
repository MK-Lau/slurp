import { Firestore } from "@google-cloud/firestore";
import { resolveFirestoreDatabase } from "./config/firestoreDatabase";

const dbName = resolveFirestoreDatabase(process.env);
const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT;

export const db = new Firestore({ projectId, databaseId: dbName });
