import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { isLoopbackUrl } from "./authEmulator";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _firestore: Firestore | null = null;
let _emulatorConnected = false;

export function initFirebase(config: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  firestoreDatabase: string;
  authEmulatorUrl?: string;
}): Auth {
  if (config.authEmulatorUrl && !isLoopbackUrl(config.authEmulatorUrl)) {
    throw new Error(`authEmulatorUrl must be loopback http (got ${config.authEmulatorUrl})`);
  }

  if (_auth) {
    if (config.authEmulatorUrl && !_emulatorConnected) {
      connectAuthEmulator(_auth, config.authEmulatorUrl, { disableWarnings: true });
      _emulatorConnected = true;
    }
    return _auth;
  }
  _app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  _auth = getAuth(_app);
  _firestore = getFirestore(_app, config.firestoreDatabase);
  if (config.authEmulatorUrl) {
    connectAuthEmulator(_auth, config.authEmulatorUrl, { disableWarnings: true });
    _emulatorConnected = true;
  }
  return _auth;
}

export function __resetFirebaseForTests(): void {
  _app = null;
  _auth = null;
  _firestore = null;
  _emulatorConnected = false;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) throw new Error("Firebase not initialized");
  return _auth;
}

export function getFirebaseFirestore(): Firestore {
  if (!_firestore) throw new Error("Firebase not initialized");
  return _firestore;
}
