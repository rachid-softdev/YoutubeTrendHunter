import { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, ArrowRight, Play, BarChart3, Sparkles } from "lucide-react"

export const metadata: Metadata = {
  title: "Niches YouTube - Détectez les tendances par catégorie | TrendHunter",
  description: "Explorez les niches YouTube les plus prometteuses : Tech, Finance, Fitness, Cuisine, Business. Identifiez les tendances en croissance rapide et créez du contenu qui explose.",
  keywords: ["niche youtube", "tendance youtube par niche", "niche tech youtube", "niche finance youtube", "niche fitness youtube", "niche cuisine youtube", "niche business youtube", "detection tendance youtube"],
  openGraph: {
    title: "Niches YouTube - Trouvez votre prochaine niche à succès | TrendHunter",
    description: "Explorez les niches YouTube les plus prometteuses. Analysez les tendances en temps réel.",
    url: "https://trendhunter.app/niches",
    siteName: "TrendHunter",
    locale: "fr_FR",
    type: "website",
  },
  alternates: {
    canonical: "https://trendhunter.app/niches",
  },
}

// Niche cards configuration
const nicheCards = [
  {
    slug: "tech",
    name: "Tech & High-Tech",
    icon: Sparkles,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    description: "IA, programmation, gadgets, technologie",
    keywords: ["Intelligence Artificielle", "Programmation", "Gadgets", "Innovation"],
  },
  {
    slug: "finance",
    name: "Finance & Crypto",
    icon: BarChart3,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    description: "Crypto, investissement, trading, économie",
    keywords: ["Cryptomonnaie", "Investissement", "Trading", "Blockchain"],
  },
  {
    slug: "fitness",
    name: "Fitness & Bien-être",
    icon: TrendingUp,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    description: "Musculation, yoga, sport, minceur",
    keywords: ["Musculation", "Yoga", "Sport", "Bien-être"],
  },
  {
    slug: "cuisine",
    name: "Cuisine & Gastronomie",
    icon: Sparkles,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/20",
    description: "Recettes, food, cuisine du monde",
    keywords: ["Recettes", "Gastronomie", "Cuisine healthy", "Food"],
  },
  {
    slug: "business",
    name: "Business & Entrepreneuriat",
    icon: BarChart3,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    description: "Marketing, start-up, développement personnel",
    keywords: ["Marketing", "Start-up", "Productivité", "Entrepreneuriat"],
  },
]

export default async function NichesPage() {
  // Get trend counts for each niche
  const nichesWithCounts = await Promise.all(
    nicheCards.map(async (card) => {
      const niche = await prisma.niche.findUnique({
        where: { slug: card.slug, isActive: true },
      })

      const trendCount = niche
        ? await prisma.trend.count({
            where: {
              nicheId: niche.id,
              expiresAt: { gt: new Date() },
            },
          })
        : 0

      return {
        ...card,
        trendCount,
        isActive: !!niche,
      }
    })
  )

  // JSON-LD for Organization
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TrendHunter",
    url: "https://trendhunter.app",
    logo: "https://trendhunter.app/logo.png",
    sameAs: ["https://twitter.com/trendhunterapp"],
  }

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink selection:bg-yt-red/30">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-dark-canvas/80 backdrop-blur-md border-b border-hairline-dark">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-yt-red p-1 group-hover:bg-yt-red-deep transition-colors">
              <Play className="w-4 h-4 text-white fill-current" />
            </div>
            <span className="text-xl font-bold">TrendHunter</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-dark-ink-secondary">
            <Link href="/niches" className="text-dark-ink font-medium">Niches</Link>
            <Link href="/pricing" className="hover:text-dark-ink transition-colors">Tarifs</Link>
          </nav>

          <Link href="/login">
            <Button variant="subscribe" size="default" className="font-bold">
              ESSAYER Gratuitement
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-12">
        {/* Hero Section */}
        <section className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yt-red/10 border border-yt-red/20 mb-6">
            <Sparkles className="w-4 h-4 text-yt-red" />
            <span className="text-[10px] font-black text-yt-red tracking-[0.2em] uppercase">5 Niches Surveillées</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black mb-4">
            Explorez les niches YouTube
          </h1>
          <p className="text-dark-ink-secondary text-lg max-w-2xl mx-auto mb-8">
            Analysez les tendances en temps réel pour chaque niche. Identifiez les opportunités de contenu avant la concurrence.
          </p>

          <Link href="/login">
            <Button variant="subscribe" size="lg" className="h-12 px-10 font-bold">
              COMMENCER L'ANALYSE
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </section>

        {/* Niche Cards Grid */}
        <section className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {nichesWithCounts.map((niche) => (
              <Link
                key={niche.slug}
                href={niche.isActive ? `/niches/${niche.slug}` : "#"}
                className={`block p-6 bg-dark-surface border transition-all group ${
                  niche.isActive
                    ? "border-hairline-dark hover:border-yt-red/50 hover:-translate-y-1"
                    : "border-hairline-dark opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 ${niche.bgColor} flex items-center justify-center border ${niche.borderColor}`}>
                    <niche.icon className={`w-6 h-6 ${niche.color}`} />
                  </div>
                  {niche.trendCount > 0 && (
                    <Badge variant="live" className="text-[10px] font-bold">
                      {niche.trendCount} tendances
                    </Badge>
                  )}
                </div>

                <h2 className="text-xl font-bold mb-2 group-hover:text-yt-red transition-colors">
                  {niche.name}
                </h2>

                <p className="text-dark-ink-secondary text-sm mb-4">
                  {niche.description}
                </p>

                <div className="flex flex-wrap gap-2">
                  {niche.keywords.map((keyword) => (
                    <Badge key={keyword} variant="outline" className="text-[10px]">
                      {keyword}
                    </Badge>
                  ))}
                </div>

                {niche.isActive && (
                  <div className="mt-4 flex items-center gap-2 text-sm font-bold text-yt-red opacity-0 group-hover:opacity-100 transition-opacity">
                    Explorer la niche
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>

        {/* Stats Section */}
        <section className="mb-16 py-12 bg-dark-surface border border-hairline-dark">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl md:text-4xl font-black text-yt-red mb-2">5</div>
              <div className="text-dark-ink-secondary text-sm">Niches actives</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-black text-yt-red mb-2">1200+</div>
              <div className="text-dark-ink-secondary text-sm">Créateurs</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-black text-yt-red mb-2">24h</div>
              <div className="text-dark-ink-secondary text-sm">Mise à jour</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-black text-yt-red mb-2">100%</div>
              <div className="text-dark-ink-secondary text-sm">Temps réel</div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center py-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Trouvez votre niche à succès
          </h2>
          <p className="text-dark-ink-secondary mb-6 max-w-xl mx-auto">
            Pas besoin de deviner quelles niches explosent. TrendHunter analyse les données pour vous.
          </p>
          <Link href="/login">
            <Button variant="subscribe" size="lg" className="h-12 px-10 font-bold">
              CRÉER UN COMPTE Gratuit
            </Button>
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-hairline-dark bg-dark-canvas">
        <div className="max-w-[1400px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="bg-dark-surface-overlay p-1">
              <Play className="w-4 h-4 text-dark-ink-secondary fill-current" />
            </div>
            <span className="font-bold">TrendHunter</span>
          </div>

          <div className="flex gap-8 text-sm text-dark-ink-secondary font-medium">
            <Link href="/pricing" className="hover:text-dark-ink">Tarifs</Link>
            <Link href="/privacy" className="hover:text-dark-ink">Confidentialité</Link>
            <Link href="/terms" className="hover:text-dark-ink">CGU</Link>
          </div>

          <div className="text-dark-ink-tertiary text-xs">
            © {new Date().getFullYear()} TrendHunter. Pour les créateurs, par des créateurs.
          </div>
        </div>
      </footer>
    </div>
  )
}