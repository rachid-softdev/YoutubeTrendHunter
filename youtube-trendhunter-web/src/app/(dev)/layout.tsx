import { notFound } from "next/navigation";

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <div className="min-h-screen bg-dark-canvas text-dark-ink">{children}</div>;
}
