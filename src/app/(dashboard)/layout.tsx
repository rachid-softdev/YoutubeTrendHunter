import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/dashboard/sidebar"
import Link from "next/link"
import { Play, LayoutDashboard, Target, Bell, CreditCard, Settings } from "lucide-react"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex flex-col md:flex-row h-screen bg-dark-canvas text-dark-ink overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar user={session.user} />
      </div>
      
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-hairline-dark bg-dark-surface z-50">
        <Link href="/" className="flex items-center gap-1">
          <div className="bg-yt-red p-1 rounded-none">
            <Play className="w-3 h-3 text-white fill-current" />
          </div>
          <span className="font-bold">TrendHunter</span>
        </Link>
        <div className="w-8 h-8 rounded-none bg-dark-surface border border-hairline-dark overflow-hidden">
          {session.user.image ? (
            <img src={session.user.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full bg-yt-red/10 flex items-center justify-center">
              <span className="text-[10px] font-black text-yt-red">{session.user.name?.charAt(0)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-dark-canvas p-4 md:p-8 pb-24 md:pb-8">
        <div className="relative z-10">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-dark-surface border-t border-hairline-dark px-6 py-3 flex items-center justify-between z-50 pb-safe">
        <Link href="/dashboard" className="flex flex-col items-center gap-1 text-yt-red">
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Trends</span>
        </Link>
        <Link href="/niches" className="flex flex-col items-center gap-1 text-dark-ink-secondary">
          <Target className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Niches</span>
        </Link>
        <Link href="/alerts" className="flex flex-col items-center gap-1 text-dark-ink-secondary">
          <Bell className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Alerts</span>
        </Link>
        <Link href="/billing" className="flex flex-col items-center gap-1 text-dark-ink-secondary">
          <CreditCard className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Billing</span>
        </Link>
        <Link href="/settings" className="flex flex-col items-center gap-1 text-dark-ink-secondary">
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Paramètres</span>
        </Link>
      </nav>
    </div>
  )
}