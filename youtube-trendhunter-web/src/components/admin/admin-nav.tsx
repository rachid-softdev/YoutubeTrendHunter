"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Users,
  CreditCard,
  Activity,
  Database,
  Zap,
  CreditCard as PlanIcon,
  ToggleLeft,
  SlidersHorizontal,
  Building2,
} from "lucide-react";
import { cn } from "@youtube-trendhunter/ui";

// ============================================
// AdminNav — navigation tabs for the admin panel
// ============================================

const TABS = [
  { key: "overview", href: "/admin", label: "Overview", icon: BarChart3 },
  { key: "users", href: "/admin/users", label: "Utilisateurs", icon: Users },
  { key: "revenue", href: "/admin/revenue", label: "Revenus", icon: CreditCard },
  { key: "logs", href: "/admin/logs", label: "Logs", icon: Activity },
  { key: "niches", href: "/admin/niches", label: "Niches", icon: Database },
  { key: "plans", href: "/admin/plans", label: "Plans & Features", icon: PlanIcon },
  { key: "features", href: "/admin/features", label: "Features", icon: ToggleLeft },
  { key: "overrides", href: "/admin/overrides", label: "Overrides", icon: SlidersHorizontal },
  { key: "orgs", href: "/admin/orgs", label: "Organisations", icon: Building2 },
  { key: "monitoring", href: "/admin/monitoring", label: "Monitoring", icon: Zap },
];

export function AdminNav() {
  const pathname = usePathname();

  // Determine active tab from the URL: /admin → overview, /admin/users → users, etc.
  const segments = pathname.split("/").filter(Boolean);
  const currentTab = segments[1] || "overview";

  return (
    <nav
      aria-label="Navigation administration"
      className="flex flex-wrap gap-2 mb-8 border-b border-hairline-dark pb-4"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === currentTab;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-yt-red text-white"
                : "bg-dark-surface border border-hairline-dark hover:border-yt-red/50",
            )}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
