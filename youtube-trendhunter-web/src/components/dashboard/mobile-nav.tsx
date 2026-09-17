"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Target, Bell, CreditCard, Settings, Shield } from "lucide-react";

const links = [
  { href: "/home", icon: LayoutDashboard, label: "Tendances" },
  { href: "/my-niches", icon: Target, label: "Niches" },
  { href: "/alerts", icon: Bell, label: "Alertes" },
  { href: "/billing", icon: CreditCard, label: "Facturation" },
  { href: "/settings", icon: Settings, label: "Paramètres" },
];

export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-dark-surface border-t border-hairline-dark px-6 py-3 flex items-center justify-between z-50 pb-safe">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-col items-center gap-1 ${isActive ? "text-yt-red" : "text-dark-ink-secondary"}`}
          >
            <link.icon className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">{link.label}</span>
          </Link>
        );
      })}
      {isAdmin && (
        <Link
          href="/admin"
          className={`flex flex-col items-center gap-1 ${pathname.startsWith("/admin") ? "text-yt-red" : "text-dark-ink-secondary"}`}
        >
          <Shield className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Admin</span>
        </Link>
      )}
    </nav>
  );
}
