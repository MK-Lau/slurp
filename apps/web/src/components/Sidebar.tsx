"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { listSlurps } from "@/lib/slurps";
import type { Slurp } from "@slurp/types";

const MOBILE_LIMIT = 3;
const DESKTOP_LIMIT = 5;

export default function Sidebar(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [created, setCreated] = useState<Slurp[]>([]);
  const [invited, setInvited] = useState<Slurp[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    listSlurps({ limit: DESKTOP_LIMIT + 1 })
      .then((res) => {
        setCreated(res.created);
        setInvited(res.invited);
      })
      .catch(() => {});
  // intentional: only refresh on user change, not on every route
  }, [user]);

  // Close drawer on navigation
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (!user) return <></>;

  const sidebarContent = (
    <>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        <Link
          href="/slurp/new"
          className="block text-center rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 transition-colors duration-150 shadow-sm"
        >
          + New Slurp
        </Link>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            Created
          </h2>
          {created.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">None yet</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {created.slice(0, DESKTOP_LIMIT).map((d, i) => (
                <li key={d.id} className={i >= MOBILE_LIMIT ? "hidden lg:block" : ""}>
                  <Link
                    href={`/slurp/${d.id}`}
                    className={`block text-sm truncate rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-gray-700 ${
                      pathname === `/slurp/${d.id}`
                        ? "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-medium"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {d.title}
                    {d.participants.every((p) => p.status === "confirmed") && (
                      <span className="ml-1 text-xs text-emerald-600">✓</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {created.length > MOBILE_LIMIT && (
            <Link
              href="/slurp?tab=created"
              className={`mt-1 block text-xs text-purple-600 hover:text-purple-800 transition-colors duration-150 ${created.length <= DESKTOP_LIMIT ? "lg:hidden" : ""}`}
            >
              See all →
            </Link>
          )}
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            Invited
          </h2>
          {invited.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">None yet</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {invited.slice(0, DESKTOP_LIMIT).map((d, i) => (
                <li key={d.id} className={i >= MOBILE_LIMIT ? "hidden lg:block" : ""}>
                  <Link
                    href={`/slurp/${d.id}`}
                    className={`block text-sm truncate rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-gray-700 ${
                      pathname === `/slurp/${d.id}`
                        ? "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-medium"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {d.title}
                    {d.participants.every((p) => p.status === "confirmed") && (
                      <span className="ml-1 text-xs text-emerald-600">✓</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {invited.length > MOBILE_LIMIT && (
            <Link
              href="/slurp?tab=invited"
              className={`mt-1 block text-xs text-purple-600 hover:text-purple-800 transition-colors duration-150 ${invited.length <= DESKTOP_LIMIT ? "lg:hidden" : ""}`}
            >
              See all →
            </Link>
          )}
        </section>
      </div>

      <div className="p-4 border-t dark:border-gray-700 bg-slate-50 dark:bg-gray-800 flex flex-col gap-1 shrink-0">
        <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</span>
        <Link
          href="/profile"
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150"
        >
          Profile
        </Link>
        <button
          onClick={signOut}
          className="text-sm text-left text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm fixed top-0 left-0 right-0 z-10">
        <button
          onClick={() => setIsOpen(true)}
          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-150 p-1 -ml-1"
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
        <Link href="/" className="font-bold text-xl text-gray-900 dark:text-gray-100 shrink-0 whitespace-nowrap">
          Slurp 🍜
        </Link>
      </div>

      {/* Mobile drawer overlay */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-20 lg:hidden"
            onClick={() => setIsOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-30 flex flex-col w-64 bg-white dark:bg-gray-900 shadow-lg lg:hidden">
            <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
              <Link href="/" className="font-bold text-xl text-gray-900 dark:text-gray-100">
                Slurp 🍜
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-150 text-2xl leading-none"
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 h-screen sticky top-0 border-r dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm shrink-0">
        <div className="p-4 border-b dark:border-gray-700">
          <Link href="/" className="font-bold text-xl text-gray-900 dark:text-gray-100">
            Slurp 🍜
          </Link>
        </div>
        {sidebarContent}
      </aside>
    </>
  );
}
