import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _firestore: Firestore | null = null;

export function initFirebase(config: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  firestoreDatabase: string;
}): Auth {
  if (_auth) return _auth;
  _app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  _auth = getAuth(_app);
  _firestore = getFirestore(_app, config.firestoreDatabase);
  return _auth;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) throw new Error("Firebase not initialized");
  return _auth;
}

export function getFirebaseFirestore(): Firestore {
  if (!_firestore) throw new Error("Firebase not initialized");
  return _firestore;
}
