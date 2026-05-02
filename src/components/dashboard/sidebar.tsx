"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, TrendingUp, Bell, CreditCard, Target } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Tendances", icon: LayoutDashboard },
  { href: "/niches", label: "Niches", icon: Target },
  { href: "/alerts", label: "Alertes", icon: Bell },
  { href: "/billing", label: "Facturation", icon: CreditCard },
]

export function Sidebar({ user }: { user: { name?: string | null; image?: string | null } }) {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white border-r px-4 py-6 flex flex-col h-screen">
      <div className="mb-8">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          TrendHunter
        </h1>
      </div>

      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-black text-white"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="pt-4 border-t">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-gray-300 overflow-hidden">
            {user.image && (
              <img src={user.image} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}