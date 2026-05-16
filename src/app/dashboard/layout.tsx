import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/dashboard/sidebar"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import Link from "next/link"
import Image from "next/image"
import { Play } from "lucide-react"

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
        <div className="w-8 h-8 rounded-none bg-dark-surface border border-hairline-dark overflow-hidden relative">
          {session.user.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name || "Avatar"}
              fill
              className="object-cover"
              referrerPolicy="no-referrer"
              sizes="32px"
            />
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
      <MobileNav />
    </div>
  )
}