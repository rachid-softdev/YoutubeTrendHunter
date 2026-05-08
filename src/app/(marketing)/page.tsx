import Link from "next/link"
import { auth } from "@/lib/auth"
import { TrendingUp, Play, Bell, BarChart3, Video, Sparkles, Zap, ArrowRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { Separator } from "@/components/ui/separator"

const features = [
  {
    icon: TrendingUp,
    title: "Algorithme de Détection",
    description: "Repérez les niches à explosion imminente avant qu'elles ne saturent.",
    badge: "IA"
  },
  {
    icon: Video,
    title: "Analyse de Concurrents",
    description: "Disséquez les stratégies qui fonctionnent pour les plus gros créateurs.",
    badge: "LIVE"
  },
  {
    icon: Bell,
    title: "Alertes Stratégiques",
    description: "Soyez le premier prévenu quand un sujet commence à buzzer.",
    badge: "NEW"
  },
  {
    icon: BarChart3,
    title: "Extension Chrome",
    description: "Les données TrendHunter directement sous chaque vidéo YouTube.",
    badge: "POPULAIRE"
  },
]

const plans = [
  {
    name: "Free",
    price: "0€",
    period: "/mois",
    description: "Pour découvrir TrendHunter",
    features: [
      "1 niche suivie",
      "5 tendances par niche",
      "Extension Chrome",
      "Support par email",
    ],
    cta: "Commencer gratuit",
    href: "/login",
    popular: false,
  },
  {
    name: "Pro",
    price: "15€",
    period: "/mois",
    description: "Pour les créateurs de contenu",
    features: [
      "Toutes les niches",
      "Tendances illimitées",
      "Alertes en temps réel",
      "Angles de contenu IA",
      "Export CSV",
      "Support prioritaire",
    ],
    cta: "Passer Pro",
    href: "/login?plan=pro",
    popular: true,
  },
  {
    name: "Team",
    price: "39€",
    period: "/mois",
    description: "Pour les équipes",
    features: [
      "Tout Pro",
      "5 utilisateurs",
      "API access",
      "Webhooks",
      "Account manager dédié",
    ],
    cta: "Contacter",
    href: "mailto:contact@trendhunter.app",
    popular: false,
  },
]

export default async function LandingPage() {
  const session = await auth()

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink selection:bg-yt-red/30">

      {/* --- Top Navigation --- */}
      <header className="sticky top-0 z-50 bg-dark-canvas/80 backdrop-blur-md border-b border-hairline-dark">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-yt-red p-1 rounded-none group-hover:bg-yt-red-deep transition-colors">
              <Play className="w-4 h-4 text-white fill-current" />
            </div>
            <span className="text-xl font-bold">TrendHunter</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-dark-ink-secondary">
            <Link href="#features" className="hover:text-dark-ink transition-colors">Fonctionnalités</Link>
            <Link href="#pricing" className="hover:text-dark-ink transition-colors">Tarifs</Link>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {session ? (
              <Link href="/dashboard">
                <Button variant="subscribe" size="default" className="font-bold flex items-center gap-2">
                  {session.user?.image ? (
                    <img src={session.user.image} alt="" className="w-4 h-4 rounded-none" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-4 h-4 bg-white/20 flex items-center justify-center rounded-none text-[8px]">
                      {session.user?.name?.charAt(0)}
                    </div>
                  )}
                  DASHBOARD
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium hover:text-dark-ink transition-colors hidden sm:block">
                  Se connecter
                </Link>
                <Link href="/login">
                  <Button variant="subscribe" size="default" className="font-bold">
                    ESSAYER GRATUITEMENT
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* --- Hero Section --- */}
        <section className="pt-20 pb-32 px-4 relative">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-8">
              {/* Left Column: Text */}
              <div className="flex-1 space-y-10 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yt-red/10 border border-yt-red/20">
                  <Sparkles className="w-4 h-4 text-yt-red" />
                  <span className="text-[10px] font-black text-yt-red tracking-[0.2em] uppercase">Intelligence Stratégique YouTube</span>
                </div>

                <h1 className="text-5xl md:text-7xl xl:text-8xl font-black leading-[1] tracking-tighter">
                  Hacker <br className="hidden lg:block" />
                  <span className="text-yt-red relative">
                    l'Algorithme.
                    <svg className="absolute -bottom-2 left-0 w-full h-3 text-yt-red/20" viewBox="0 0 100 10" preserveAspectRatio="none">
                      <path d="M0 5 Q 25 0 50 5 T 100 5" fill="none" stroke="currentColor" strokeWidth="4" />
                    </svg>
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-dark-ink-secondary max-w-2xl mx-auto lg:mx-0 leading-relaxed font-medium">
                  TrendHunter analyse des millions de vidéos pour vous livrer les niches à explosion imminente. Ne suivez plus les tendances, créez-les.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
                  <Link href="/login" className="w-full sm:w-auto">
                    <Button variant="subscribe" size="lg" className="w-full h-12 px-10 text-base font-bold group">
                      DÉMARRER L'ANALYSE
                      <Zap className="ml-2 w-4 h-4 group-hover:scale-125 transition-transform" />
                    </Button>
                  </Link>
                  <Link href="#features" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" className="w-full h-12 px-10 text-base font-bold border-hairline-dark hover:bg-dark-surface transition-colors">
                      VOIR LES FONCTIONNALITÉS
                    </Button>
                  </Link>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-6 pt-8 justify-center lg:justify-start">
                  <div className="flex -space-x-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-dark-canvas bg-dark-surface overflow-hidden shadow-xl">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 42}`} alt="User" />
                      </div>
                    ))}
                  </div>
                  <div className="text-sm">
                    <p className="font-bold text-dark-ink">Rejoint par +1,200 créateurs</p>
                    <div className="flex items-center gap-1 text-yt-red font-black text-[10px] uppercase tracking-widest">
                      <Zap className="w-3 h-3 fill-current" /> En direct de YouTube
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Visual Player */}
              <div className="flex-1 w-full max-w-2xl lg:max-w-none relative animate-float" style={{ animationDuration: '4s' }}>
                <div className="absolute -inset-10 bg-yt-red/10 blur-[100px] rounded-full opacity-50" />
                <div className="relative bg-dark-surface border border-hairline-dark p-2 shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden group">
                  <div className="bg-black aspect-video relative overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop"
                      className="absolute inset-0 w-full h-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-110"
                      alt="YouTube Dashboard"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-20 h-20 bg-yt-red rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                        <Play className="w-8 h-8 text-white fill-current ml-1" />
                      </div>
                    </div>

                    <div className="absolute top-6 left-6 flex items-center gap-3">
                      <Badge variant="live" className="px-3 py-1 font-black">ULTRA-TRENDING</Badge>
                      <Badge variant="outline" className="bg-black/50 border-white/20 text-[10px] font-bold tracking-widest">98.4% SCORE</Badge>
                    </div>

                    <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
                      <div className="space-y-2">
                        <div className="text-xs font-black tracking-widest text-white/50 uppercase">Niche: IA & PRODUCTIVITÉ</div>
                        <div className="h-1.5 w-40 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-full w-[85%] bg-yt-red" />
                        </div>
                      </div>
                      <div className="w-12 h-12 bg-white/10 flex items-center justify-center border border-white/20">
                        <TrendingUp className="w-6 h-6 text-yt-red" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Feature Grid Section --- */}
        <section id="features" className="py-24 bg-dark-surface/30 border-y border-hairline-dark">
          <div className="max-w-[1400px] mx-auto px-4">
            <div className="text-center space-y-4 mb-16">
              <h2 className="text-3xl md:text-4xl font-bold">L'arsenal ultime du créateur</h2>
              <p className="text-dark-ink-secondary max-w-2xl mx-auto">
                Des outils conçus pour la performance, inspirés par l'écosystème YouTube.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, idx) => (
                <div key={idx} className="group p-6 bg-dark-canvas border border-hairline-dark hover:border-yt-red/50 transition-all hover:-translate-y-1 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-yt-red/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 bg-dark-surface flex items-center justify-center mb-6 group-hover:bg-yt-red/10 transition-colors">
                    <feature.icon className="w-6 h-6 text-dark-ink-secondary group-hover:text-yt-red transition-colors" />
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-lg">{feature.title}</h3>
                    <Badge variant="outline" className="text-[10px] opacity-50">{feature.badge}</Badge>
                  </div>
                  <p className="text-dark-ink-secondary text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Pricing Section --- */}
        <section id="pricing" className="py-24 px-4 border-b border-hairline-dark">
          <div className="max-w-[1400px] mx-auto">
            <div className="text-center space-y-4 mb-16">
              <h2 className="text-3xl md:text-4xl font-bold">Tarifs simples et transparents</h2>
              <p className="text-dark-ink-secondary max-w-2xl mx-auto">
                Choisissez le plan qui correspond à vos besoins. Sans engagement.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`border p-8 flex flex-col relative ${
                    plan.popular
                      ? "border-yt-red bg-dark-surface"
                      : "border-hairline-dark bg-dark-surface/40"
                  }`}
                >
                  {plan.popular && (
                    <Badge variant="live" className="w-fit mb-4 text-[10px] font-bold tracking-widest">
                      POPULAIRE
                    </Badge>
                  )}
                  <div className="mb-6">
                    <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                    <p className="text-dark-ink-secondary text-sm">{plan.description}</p>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-dark-ink-secondary">{plan.period}</span>
                    </div>
                  </div>

                  <Separator className="mb-6 opacity-20" />

                  <ul className="space-y-3 flex-1 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm">
                        <Check className="w-4 h-4 text-yt-red shrink-0" />
                        <span className="text-dark-ink-secondary">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href={plan.href}>
                    <Button
                      className="w-full"
                      variant={plan.popular ? "subscribe" : "outline"}
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- CTA Section --- */}
        <section className="py-24 px-4 text-center">
          <div className="max-w-3xl mx-auto space-y-6 bg-dark-surface p-12 border border-hairline-dark">
            <h2 className="text-3xl md:text-4xl font-bold">Prêt à hacker l'algorithme ?</h2>
            <p className="text-lg text-dark-ink-secondary">
              Rejoignez les créateurs qui ont déjà un temps d'avance.
            </p>
            <Link href="/login" className="inline-block pt-4 group">
              <Button variant="subscribe" size="lg" className="h-12 px-12 text-base font-bold">
                COMMENCER L'AVENTURE
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* --- Footer --- */}
      <footer className="py-12 border-t border-hairline-dark bg-dark-canvas">
        <div className="max-w-[1400px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="bg-dark-surface-overlay p-1 rounded">
              <Play className="w-4 h-4 text-dark-ink-secondary fill-current" />
            </div>
            <span className="font-bold">TrendHunter</span>
          </div>

          <div className="flex gap-8 text-sm text-dark-ink-secondary font-medium">
            <Link href="#pricing" className="hover:text-dark-ink">Tarifs</Link>
            <Link href="#" className="hover:text-dark-ink">Confidentialité</Link>
            <Link href="#" className="hover:text-dark-ink">CGU</Link>
          </div>

          <div className="text-dark-ink-tertiary text-xs">
            © {new Date().getFullYear()} TrendHunter. Pour les créateurs, par des créateurs.
          </div>
        </div>
      </footer>
    </div>
  )
}