"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { listSlurps } from "@/lib/slurps";
import { Avatar, Card, Btn } from "@/components/ui";
import type { Slurp } from "@slurp/types";

const MOBILE_LIMIT = 3;
const DESKTOP_LIMIT = 5;

function SignOutModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
      <Card className="p-6 max-w-xs w-full shadow-xl">
        <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Sign out?</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">You'll need to sign back in to access your Slurps.</p>
        <div className="flex gap-2">
          <Btn variant="danger" className="flex-1" onClick={onConfirm}>Sign out</Btn>
          <Btn variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Btn>
        </div>
      </Card>
    </div>
  );
}

export default function Sidebar(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [created, setCreated] = useState<Slurp[]>([]);
  const [invited, setInvited] = useState<Slurp[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    listSlurps()
      .then((res) => {
        setCreated(res.created);
        setInvited(res.invited);
      })
      .catch(() => {});
  // intentional: only refresh on user change
  }, [user]);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (!user) return <></>;

  function linkClass(id: string): string {
    const isActive = pathname === `/slurp/${id}`;
    return `flex items-center gap-2 px-3 py-2 rounded-xl text-sm truncate transition-all duration-150 w-full text-left ${
      isActive
        ? "bg-purple-50 text-purple-700 font-semibold dark:bg-purple-900/30 dark:text-purple-300"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    }`;
  }

  const isHomeActive = pathname === "/" || pathname === "/slurp";

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <Link
          href="/"
          className="font-bold text-xl text-gray-900 dark:text-gray-100 tracking-tight hover:text-purple-700 dark:hover:text-purple-400 transition-colors"
        >
          Slurp 🍜
        </Link>
        {isOpen && (
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 text-2xl leading-none transition-colors"
            aria-label="Close menu"
          >
            ×
          </button>
        )}
      </div>

      {/* New Slurp */}
      <div className="px-3 pt-4 pb-2">
        <Link href="/slurp/new" className="block">
          <Btn variant="primary" className="w-full">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New Slurp
          </Btn>
        </Link>
      </div>

      {/* All Slurps link */}
      <div className="px-3 py-2">
        <Link href="/slurp" className={`${linkClass("__home")} ${isHomeActive ? "bg-purple-50 text-purple-700 font-semibold" : ""}`}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M2 6.5L8 2l6 4.5V14H10v-4H6v4H2V6.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          All Slurps
        </Link>
      </div>

      {/* Slurp lists */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-5">
        {created.length > 0 && (
          <div>
            <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Created</p>
            <ul className="space-y-0.5">
              {created.slice(0, DESKTOP_LIMIT).map((d, i) => (
                <li key={d.id} className={i >= MOBILE_LIMIT ? "hidden lg:block" : ""}>
                  <Link href={`/slurp/${d.id}`} className={linkClass(d.id)}>
                    <span className="truncate flex-1">{d.title}</span>
                    {d.participants.every((p) => p.status === "confirmed") && (
                      <span className="text-emerald-500 shrink-0 text-xs">✓</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {created.length > DESKTOP_LIMIT && (
              <Link href="/slurp?tab=created" className="mt-1 block text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 transition-colors px-3">
                See all →
              </Link>
            )}
          </div>
        )}

        {invited.length > 0 && (
          <div>
            <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Invited</p>
            <ul className="space-y-0.5">
              {invited.slice(0, DESKTOP_LIMIT).map((d, i) => (
                <li key={d.id} className={i >= MOBILE_LIMIT ? "hidden lg:block" : ""}>
                  <Link href={`/slurp/${d.id}`} className={linkClass(d.id)}>
                    <span className="truncate flex-1">{d.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {invited.length > DESKTOP_LIMIT && (
              <Link href="/slurp?tab=invited" className="mt-1 block text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 transition-colors px-3">
                See all →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3">
        <Avatar name={user.displayName ?? user.email ?? "?"} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
            {user.displayName ?? user.email ?? "—"}
          </p>
          <div className="flex gap-3 mt-0.5">
            <Link
              href="/profile"
              className="text-xs text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
            >
              Profile
            </Link>
            <button
              onClick={() => setConfirmSignOut(true)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center gap-3 px-4 h-14 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shadow-sm fixed top-0 left-0 right-0 z-30">
        <button
          onClick={() => setIsOpen(true)}
          className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors p-1 -ml-1"
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
        <Link href="/" className="font-bold text-lg tracking-tight text-gray-900 dark:text-gray-100 hover:text-purple-700 dark:hover:text-purple-400 transition-colors">
          Slurp 🍜
        </Link>
      </div>

      {/* Mobile drawer overlay */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40 lg:hidden backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-gray-900 shadow-xl lg:hidden flex flex-col">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 h-screen sticky top-0 border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        {sidebarContent}
      </aside>

      {confirmSignOut && (
        <SignOutModal
          onConfirm={() => { setConfirmSignOut(false); void signOut(); }}
          onCancel={() => setConfirmSignOut(false)}
        />
      )}
    </>
  );
}
