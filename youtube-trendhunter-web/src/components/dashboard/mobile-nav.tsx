"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Target, Bell, CreditCard, Settings } from "lucide-react";

const links = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Trends" },
  { href: "/my-niches", icon: Target, label: "Niches" },
  { href: "/alerts", icon: Bell, label: "Alerts" },
  { href: "/billing", icon: CreditCard, label: "Billing" },
  { href: "/settings", icon: Settings, label: "Paramètres" },
];

export function MobileNav() {
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
    </nav>
  );
}
