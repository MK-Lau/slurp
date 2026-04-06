import type { Metadata } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:8080";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const { id } = await params;
    const res = await fetch(`${apiUrl}/slurps/${id}/og`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("not found");
    const { title, hostName } = await res.json() as { title: string; hostName: string };
    return {
      title: `${title} — Slurp`,
      description: `${hostName} is splitting a receipt. Join to claim your items.`,
      openGraph: {
        title: `${title} — Slurp`,
        description: `${hostName} is splitting a receipt. Join to claim your items.`,
        images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
      },
    };
  } catch {
    return {
      title: "Slurp",
      description: "Split receipts with friends",
    };
  }
}

export default function SlurpLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
