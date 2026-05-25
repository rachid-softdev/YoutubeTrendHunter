"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bell, CreditCard, Target, Play, LogOut, Settings } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@youtube-trendhunter/ui";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/dashboard", label: "Tendances", icon: LayoutDashboard },
  { href: "/my-niches", label: "Niches", icon: Target },
  { href: "/alerts", label: "Alertes", icon: Bell },
  { href: "/billing", label: "Facturation", icon: CreditCard },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function Sidebar({ user }: { user: { name?: string | null; image?: string | null } }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-dark-surface border-r border-hairline-dark px-4 py-6 flex flex-col h-screen">
      <div className="mb-8 px-2">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="bg-yt-red p-1 rounded-none group-hover:bg-yt-red-deep transition-colors">
            <Play className="w-4 h-4 text-white fill-current" />
          </div>
          <span className="text-xl font-bold">TrendHunter</span>
        </Link>
      </div>

      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-none text-sm font-medium transition-colors",
                isActive
                  ? "bg-yt-red text-white"
                  : "text-dark-ink-secondary hover:bg-dark-overlay hover:text-dark-ink",
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Separator className="my-4" />

      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="flex items-center gap-3 px-3 py-2 rounded-none text-sm font-medium text-dark-ink-secondary hover:bg-yt-red/10 hover:text-yt-red transition-colors w-full text-left mb-2"
      >
        <LogOut className="w-5 h-5" />
        Déconnexion
      </button>

      <div className="flex items-center gap-3 p-3 bg-dark-overlay rounded-none">
        <div className="w-8 h-8 rounded-none bg-dark-surface border border-hairline-dark overflow-hidden relative">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name || "Avatar"}
              fill
              className="object-cover"
              referrerPolicy="no-referrer"
              sizes="32px"
            />
          ) : (
            <div className="w-full h-full bg-yt-red/20 flex items-center justify-center">
              <span className="text-xs font-bold text-yt-red">
                {user.name?.charAt(0).toUpperCase() || "U"}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-dark-ink">{user.name || "Utilisateur"}</p>
        </div>
      </div>
    </aside>
  );
}
