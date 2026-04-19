"use client";

import { useEffect, useState } from "react";

// ─── Avatar ──────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
];

const AVATAR_SIZES = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-12 h-12 text-base",
};

export function Avatar({ name = "?", size = "md" }: { name?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const colorClass = AVATAR_PALETTE[(name.charCodeAt(0) || 0) % AVATAR_PALETTE.length];
  return (
    <div className={`${AVATAR_SIZES[size]} ${colorClass} rounded-full flex items-center justify-center font-bold shrink-0 select-none`}>
      {initials}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeColor = "gray" | "green" | "amber" | "purple" | "red" | "blue";

const BADGE_COLORS: Record<BadgeColor, string> = {
  gray:   "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  green:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  amber:  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  red:    "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
  blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

export function Badge({ children, color = "gray" }: { children: React.ReactNode; color?: BadgeColor }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${BADGE_COLORS[color]}`}>
      {children}
    </span>
  );
}

// ─── Btn ─────────────────────────────────────────────────────────────────────

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type BtnSize = "xs" | "sm" | "md" | "lg";

const BTN_SIZES: Record<BtnSize, string> = {
  xs: "px-3 py-1.5 text-xs",
  sm: "px-3.5 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary:   "bg-purple-600 text-white hover:bg-purple-700 shadow-sm",
  secondary: "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700",
  ghost:     "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200",
  danger:    "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  success:   "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
  outline:   "border border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/20",
};

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
}

export function Btn({ children, variant = "primary", size = "md", className = "", disabled, ...props }: BtnProps) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400";
  const pressEffect = disabled ? "" : "active:scale-[0.97]";
  return (
    <button
      className={`${base} ${pressEffect} ${BTN_SIZES[size]} ${BTN_VARIANTS[variant]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ children, className = "", onClick, hover, ...props }: CardProps) {
  const hasHover = hover ?? !!onClick;
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm ${hasHover ? "cursor-pointer hover:shadow-md hover:border-purple-100 dark:hover:border-purple-700 active:scale-[0.99] transition-all duration-150" : ""} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── TabBar ──────────────────────────────────────────────────────────────────

interface TabBarProps {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  const activeIdx = tabs.findIndex((t) => t.key === active);
  const w = 100 / tabs.length;
  return (
    <div className="relative flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
      <div
        className="absolute top-1 bottom-1 rounded-xl bg-white dark:bg-gray-700 shadow-sm transition-all duration-200 ease-out"
        style={{ left: `calc(${activeIdx * w}% + 4px)`, width: `calc(${w}% - 8px)` }}
      />
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`relative z-10 flex-1 py-2 text-sm font-semibold rounded-xl transition-colors duration-150 ${active === t.key ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── PageFade ────────────────────────────────────────────────────────────────

export function PageFade({ children }: { children: React.ReactNode }) {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVis(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
      }}
    >
      {children}
    </div>
  );
}

// ─── SectionHeader ───────────────────────────────────────────────────────────

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{title}</h2>
      {action}
    </div>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{title}</p>
      {subtitle && <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{subtitle}</p>}
      {action}
    </div>
  );
}

// ─── CopyButton ──────────────────────────────────────────────────────────────

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <Btn variant="secondary" size="sm" onClick={handleCopy}>
      {copied ? "✓ Copied" : "Copy link"}
    </Btn>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
          {label}
          {required && <span className="text-red-400 text-xs">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── TextInput ───────────────────────────────────────────────────────────────

export function TextInput({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition ${className}`}
      {...props}
    />
  );
}

// ─── NumberInput ─────────────────────────────────────────────────────────────

export function NumberInput({
  prefix,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string }) {
  if (!prefix) {
    return (
      <input
        type="number"
        className={`w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition ${className}`}
        {...props}
      />
    );
  }
  return (
    <div className={`flex rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden focus-within:ring-2 focus-within:ring-purple-400 focus-within:border-transparent transition ${className}`}>
      <span className="px-3 flex items-center text-sm text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/60 select-none">
        {prefix}
      </span>
      <input
        type="number"
        className="flex-1 px-3 py-2.5 text-sm bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none min-w-0"
        {...props}
      />
    </div>
  );
}

// ─── UISelect ────────────────────────────────────────────────────────────────

export function UISelect({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition appearance-none ${className}`}
      {...props}
    />
  );
}

// ─── UIToggle ────────────────────────────────────────────────────────────────

export function UIToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${checked ? "bg-purple-600" : "bg-gray-200 dark:bg-gray-600"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-gray-100 dark:border-gray-700 ${className}`} />;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse"
          style={{ width: i === lines - 1 ? "55%" : "100%" }}
        />
      ))}
    </div>
  );
}
