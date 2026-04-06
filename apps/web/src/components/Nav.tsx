"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function Nav(): React.JSX.Element {
  const { user, signOut } = useAuth();

  if (!user) return <></>;

  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b">
      <Link href="/" className="font-bold text-lg">
        Slurp 🍜
      </Link>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">{user.email}</span>
        <button
          onClick={signOut}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
