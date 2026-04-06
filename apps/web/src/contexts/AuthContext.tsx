"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  getRedirectResult,
  getAdditionalUserInfo,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { initFirebase } from "@/lib/firebase";
import { getConfig } from "@/lib/config";
import { getProfile } from "@/lib/users";

interface AuthProfile {
  displayName: string | undefined;
  venmoUsername: string | undefined;
  dismissedVenmo: boolean;
  /** True while the profile is being fetched. */
  loading: boolean;
  /** True only after a successful profile fetch. False if the fetch failed. */
  ready: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  profile: AuthProfile;
  venmoPromptPending: boolean;
  triggerVenmoPrompt: () => void;
  clearVenmoPrompt: () => void;
  markVenmoDismissed: () => void;
  refreshProfile: () => Promise<void>;
  signIn: () => Promise<{ isNewUser: boolean; googleDisplayName: string | null }>;
  signOut: () => Promise<void>;
  sendEmailSignInLink: (email: string, continueUrl: string) => Promise<void>;
  isEmailSignInLink: () => Promise<boolean>;
  completeEmailSignIn: (email: string) => Promise<{ isNewUser: boolean }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileDisplayName, setProfileDisplayName] = useState<string | undefined>(undefined);
  const [profileVenmoUsername, setProfileVenmoUsername] = useState<string | undefined>(undefined);
  const [profileDismissedVenmo, setProfileDismissedVenmo] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [venmoPromptPending, setVenmoPromptPending] = useState(false);

  const triggerVenmoPrompt = useCallback((): void => setVenmoPromptPending(true), []);
  const clearVenmoPrompt = useCallback((): void => setVenmoPromptPending(false), []);
  const markVenmoDismissed = useCallback((): void => setProfileDismissedVenmo(true), []);

  const refreshProfile = useCallback(async (): Promise<void> => {
    setProfileLoading(true);
    try {
      const profile = await getProfile();
      setProfileDisplayName(profile.displayName ?? undefined);
      setProfileVenmoUsername(profile.venmoUsername ?? undefined);
      setProfileDismissedVenmo(profile.dismissedVenmoPrompt ?? false);
      setProfileReady(true);
    } catch {
      // ignore — keep profileReady as-is so a transient error doesn't reset it
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    getConfig()
      .then(async (config) => {
        const auth = initFirebase(config);
        await getRedirectResult(auth).catch(() => {});
        unsub = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setLoading(false);
          if (u) {
            setProfileLoading(true);
            getProfile()
              .then((p) => {
                setProfileDisplayName(p.displayName ?? undefined);
                setProfileVenmoUsername(p.venmoUsername ?? undefined);
                setProfileDismissedVenmo(p.dismissedVenmoPrompt ?? false);
                setProfileReady(true);
              })
              .catch(() => {
                // Profile fetch failed — leave profileReady false so the Sidebar
                // doesn't incorrectly redirect the user to /profile.
              })
              .finally(() => setProfileLoading(false));
          } else {
            setProfileDisplayName(undefined);
            setProfileVenmoUsername(undefined);
            setProfileDismissedVenmo(false);
            setProfileReady(false);
            setVenmoPromptPending(false);
          }
        });
      })
      .catch(() => setLoading(false));
    return (): void => unsub?.();
  }, []);

  async function signIn(): Promise<{ isNewUser: boolean; googleDisplayName: string | null }> {
    const config = await getConfig();
    const auth = initFirebase(config);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      return {
        isNewUser: getAdditionalUserInfo(result)?.isNewUser ?? false,
        googleDisplayName: result.user.displayName,
      };
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err) {
        const code = (err as { code: string }).code;
        if (code === "auth/popup-blocked") {
          await signInWithRedirect(auth, provider);
          return { isNewUser: false, googleDisplayName: null };
        } else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
          return { isNewUser: false, googleDisplayName: null };
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  async function signOut(): Promise<void> {
    const config = await getConfig();
    const auth = initFirebase(config);
    await firebaseSignOut(auth);
  }

  async function sendEmailSignInLink(email: string, continueUrl: string): Promise<void> {
    const config = await getConfig();
    const auth = initFirebase(config);
    await sendSignInLinkToEmail(auth, email, { url: continueUrl, handleCodeInApp: true });
    localStorage.setItem("emailForSignIn", email);
  }

  async function isEmailSignInLink(): Promise<boolean> {
    const config = await getConfig();
    const auth = initFirebase(config);
    return isSignInWithEmailLink(auth, window.location.href);
  }

  async function completeEmailSignIn(email: string): Promise<{ isNewUser: boolean }> {
    const config = await getConfig();
    const auth = initFirebase(config);
    try {
      const result = await signInWithEmailLink(auth, email, window.location.href);
      return { isNewUser: getAdditionalUserInfo(result)?.isNewUser ?? false };
    } finally {
      localStorage.removeItem("emailForSignIn");
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, profile: { displayName: profileDisplayName, venmoUsername: profileVenmoUsername, dismissedVenmo: profileDismissedVenmo, loading: profileLoading, ready: profileReady }, venmoPromptPending, triggerVenmoPrompt, clearVenmoPrompt, markVenmoDismissed, refreshProfile, signIn, signOut, sendEmailSignInLink, isEmailSignInLink, completeEmailSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
