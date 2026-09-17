import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = {
  title: "Administration - TrendHunter",
};

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-yt-red p-2">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black">Administration</h1>
            <p className="text-dark-ink-secondary">Tableau de bord administrateur</p>
          </div>
        </div>

        <AdminNav />

        {children}
      </div>
    </div>
  );
}
