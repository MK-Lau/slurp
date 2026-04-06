import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import Sidebar from "@/components/Sidebar";
import VenmoPrompt from "@/components/VenmoPrompt";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Slurp",
  description: "Split receipts with friends",
  viewport: "width=device-width, initial-scale=1",
  openGraph: {
    title: "Slurp",
    description: "Split receipts with friends",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
  },
  manifest: "/manifest.json",
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>
          <div className="flex min-h-screen bg-slate-50 dark:bg-gray-950">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <div className="lg:hidden h-[53px] shrink-0" />
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
          <VenmoPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}
