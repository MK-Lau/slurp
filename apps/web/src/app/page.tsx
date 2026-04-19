"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getConfig } from "@/lib/config";

export default function Home(): React.JSX.Element {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signIn" && params.get("oobCode")) {
      const continueUrl = params.get("continueUrl");
      if (!continueUrl) {
        router.replace(`/login${window.location.search}`);
        return;
      }
      // Keep in sync with Firebase Console > Authentication > Authorized domains
      getConfig().then((config) => {
        const trusted = new Set([
          "http://localhost:3000",
          `https://${config.projectId}.firebaseapp.com`,
          `https://${config.projectId}.web.app`,
          ...(config.appUrl ? [config.appUrl] : []),
        ]);
        try {
          const targetOrigin = new URL(continueUrl).origin;
          if (targetOrigin !== window.location.origin && trusted.has(targetOrigin)) {
            window.location.href = `${targetOrigin}/login${window.location.search}`;
            return;
          }
        } catch (_) { /* invalid continueUrl — fall through */ }
        router.replace(`/login${window.location.search}`);
      }).catch(() => {
        router.replace(`/login${window.location.search}`);
      });
    } else if (!loading) {
      router.replace(user ? "/slurp" : "/login");
    }
  }, [router, user, loading]);

  return </>;
}
