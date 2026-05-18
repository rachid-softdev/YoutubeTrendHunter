import { signIn } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Play, TrendingUp, Sparkles, ShieldCheck } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Header — logo only, same style as landing page */}
      <header className="sticky top-0 z-50 bg-dark-canvas/80 backdrop-blur-md border-b border-hairline-dark">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-yt-red p-1 rounded-none group-hover:bg-yt-red-deep transition-colors">
              <Play className="w-4 h-4 text-white fill-current" />
            </div>
            <span className="text-xl font-bold">TrendHunter</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">

      <div className="w-full max-w-[440px] space-y-8">
        {/* Cinematic Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yt-red/10 border border-yt-red/20 text-yt-red text-xs font-bold tracking-widest uppercase">
            <Sparkles className="w-3 h-3" />
            Accès Privé
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter">
            Hacker <span className="text-yt-red">l'Algorithme.</span>
          </h1>
          <p className="text-dark-ink-secondary text-lg font-medium leading-relaxed">
            Connectez-vous pour débloquer les tendances de demain.
          </p>
        </div>

        {/* Premium Auth Card */}
        <div className="bg-dark-surface/40 backdrop-blur-md border border-hairline-dark p-8 shadow-2xl relative overflow-hidden group">
          {/* Subtle Glow Effect inside card */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-yt-red/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          
          <div className="relative z-10 space-y-8">
            <div className="space-y-6">
              <form
                action={async () => {
                  "use server"
                  await signIn("google", { redirectTo: "/dashboard" })
                }}
              >
                <Button
                  type="submit"
                  variant="subscribe"
                  size="lg"
                  className="w-full h-12 flex items-center justify-center gap-4 text-base font-bold transition-colors"
                >
                  <div className="bg-white p-1 rounded-sm">
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.163 1.196-.653 2.212-1.388 2.835v2.345h2.453c1.284-2.375 2.453-4.975 2.453-7.835z" />
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.802 5.956-2.18l-2.453-2.345c-.802.537-1.828.857-3.503.857-2.688 0-4.962-1.818-5.78-4.253H.919v2.573C2.421 15.462 5.493 18 9 18z" />
                      <path fill="#FBBC05" d="M3.22 10.672c1.055-.002 2.006.361 2.756 1.059v-2.573H.919C.303 11.893 0 13.093 0 14.444c0 1.35.303 2.55.919 3.556l2.3-1.544-.001-2.784z" />
                      <path fill="#EA4335" d="M9 3.822c1.467 0 2.784.503 3.823 1.492l2.254-2.254C13.512 1.478 11.431 0 9 0 5.493 0 2.421 2.538.919 5.556L3.22 6.1c.818-2.435 3.092-4.278 5.78-4.278z" />
                    </svg>
                  </div>
                  Continuer avec Google
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-hairline-dark"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-transparent px-4 text-dark-ink-tertiary font-bold tracking-widest">Sécurisé</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: TrendingUp, label: "IA Analytics" },
                  { icon: ShieldCheck, label: "Sécurisé" },
                  { icon: Sparkles, label: "VIP Trends" }
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5">
                    <item.icon className="w-5 h-5 text-dark-ink-secondary" />
                    <span className="text-[10px] font-bold text-dark-ink-tertiary uppercase">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Link */}
        <p className="text-center text-sm text-dark-ink-tertiary font-medium">
          En continuant, vous acceptez nos{" "}
          <Link href="#" className="text-dark-ink hover:text-yt-red transition-colors underline decoration-dark-ink-tertiary underline-offset-4">
            Conditions
          </Link>{" "}
          et notre{" "}
          <Link href="#" className="text-dark-ink hover:text-yt-red transition-colors underline decoration-dark-ink-tertiary underline-offset-4">
            Confidentialité
          </Link>.
        </p>
      </div>
      </div>
    </div>
  )
}