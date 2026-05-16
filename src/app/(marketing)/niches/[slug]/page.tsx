import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TrendingUp, ArrowLeft, Play, BarChart3, Clock } from "lucide-react"

// Niche metadata for SEO
const nicheMetadata: Record<string, { title: string; description: string; keywords: string[] }> = {
  tech: {
    title: "Tendances Tech YouTube 2026 - Niche High-Tech en pleine croissance",
    description: "Découvrez les tendances tech YouTube les plus en hausse. Analyse en temps réel des niches high-tech, IA, programmation et gadgets. TrendingHunter vous aide à anticiper les vidéos à succès.",
    keywords: ["tendance youtube tech", "tendance high-tech youtube", "niche tech youtube 2026", "viral tech youtube", "ia youtube tendances", "programmation youtube trends"],
  },
  finance: {
    title: "Tendances Finance YouTube 2026 - Crypto, investissement et trading",
    description: "Suivez les tendances finance YouTube en temps réel. Crypto, investissement, trading, cryptomonnaie. Identifiez les niches financières à fort potentiel de croissance.",
    keywords: ["tendance youtube finance", "crypto youtube trends", "investissement youtube 2026", "trading youtube tendances", "cryptomonnaie youtube viral"],
  },
  fitness: {
    title: "Tendances Fitness YouTube 2026 - Sports, musculation et bien-être",
    description: "Découvrez les tendances fitness et bien-être YouTube les plus populaires. Sport, musculation, yoga, perte de poids. Trouvez les angles de contenu à succès.",
    keywords: ["tendance youtube fitness", "musculation youtube trends", "bien-être youtube 2026", "sport youtube viral", "yoga youtube tendances"],
  },
  cuisine: {
    title: "Tendances Cuisine YouTube 2026 - Recettes, food et gastronomie",
    description: "Explorez les tendances cuisine YouTube. Recettes, food, gastronomie, cuisine du monde. Identifiez les thématiques culinaires en pleine expansion.",
    keywords: ["tendance youtube cuisine", "recettes youtube 2026", "food youtube trends", "gastronomie youtube viral", "cuisine youtube tendances"],
  },
  business: {
    title: "Tendances Business YouTube 2026 - Entrepreneuriat et développement personnel",
    description: "Suivez les tendances business et entrepreneuriat YouTube. Marketing, développement personnel, start-up, productivité. Trouvez votre prochaine niche à succès.",
    keywords: ["tendance youtube business", "entrepreneuriat youtube 2026", "marketing youtube trends", "développement personnel youtube", "startup youtube viral"],
  },
}

// FAQ Schema for JSON-LD
const faqSchema = [
  {
    question: "Comment TrendHunter détecte-t-il les tendances YouTube ?",
    answer: "TrendHunter utilise un algorithme d'IA avancé qui analyse des millions de vidéos YouTube en temps réel. Il identifie les signaux de croissance précoces comme l'augmentation des vues, les nouveaux concurrents, et les topics émergents dans chaque niche.",
  },
  {
    question: "Quelles niches sont disponibles sur TrendHunter ?",
    answer: "TrendHunter couvre 5 principales niches : Tech, Finance, Fitness, Cuisine et Business. Chaque niche est suivie en temps réel avec des mises à jour quotidiennes des tendances.",
  },
  {
    question: "Comment utiliser les tendances pour mon contenu YouTube ?",
    answer: "Chaque tendance sur TrendHunter inclut des angles de contenu suggérés, un score de潜力, et des données sur les concurrents. Vous pouvez identifier les opportunités avant qu'elles ne saturent le marché.",
  },
]

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const niches = await prisma.niche.findMany({
    where: { isActive: true },
    select: { slug: true },
  })

  return niches.map((niche) => ({
    slug: niche.slug,
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const metadata = nicheMetadata[slug]

  if (!metadata) {
    return {
      title: "Niche non trouvée - TrendHunter",
    }
  }

  return {
    title: metadata.title,
    description: metadata.description,
    keywords: metadata.keywords,
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      url: `https://trendhunter.app/niches/${slug}`,
      siteName: "TrendHunter",
      locale: "fr_FR",
      type: "website",
    },
    alternates: {
      canonical: `https://trendhunter.app/niches/${slug}`,
    },
  }
}

export default async function NichePage({ params }: Props) {
  const { slug } = await params

  // Fetch niche and its trends with count in a single query
  const niche = await prisma.niche.findUnique({
    where: { slug, isActive: true },
    include: {
      trends: {
        where: {
          expiresAt: { gt: new Date() },
        },
        orderBy: { score: "desc" },
        take: 10,
      },
      // Count trends directly in the same query to avoid N+1
      _count: {
        select: {
          trends: {
            where: { expiresAt: { gt: new Date() } }
          }
        }
      },
    },
  })

  if (!niche) {
    notFound()
  }

  // Access count directly from the _count field - no separate query needed!
  const trendCount = niche._count.trends

  // JSON-LD schemas
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "TrendHunter",
        url: "https://trendhunter.app",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://trendhunter.app/search?q={search_term_string}",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Accueil",
            item: "https://trendhunter.app",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Niches",
            item: "https://trendhunter.app/niches",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: niche.name,
            item: `https://trendhunter.app/niches/${slug}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqSchema.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
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
            <Link href="/niches" className="hover:text-dark-ink transition-colors">Niches</Link>
            <Link href="#pricing" className="hover:text-dark-ink transition-colors">Tarifs</Link>
          </nav>

          <Link href="/login">
            <Button variant="subscribe" size="default" className="font-bold">
              ESSAYER Gratuitement
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <nav className="mb-8">
          <div className="flex items-center gap-2 text-sm text-dark-ink-secondary">
            <Link href="/" className="hover:text-dark-ink transition-colors">Accueil</Link>
            <span>/</span>
            <Link href="/niches" className="hover:text-dark-ink transition-colors">Niches</Link>
            <span>/</span>
            <span className="text-dark-ink font-medium">{niche.name}</span>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="mb-16">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-16 h-16 bg-yt-red/10 flex items-center justify-center border border-yt-red/20">
              <TrendingUp className="w-8 h-8 text-yt-red" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-black mb-2">{niche.name}</h1>
              <p className="text-dark-ink-secondary text-lg max-w-2xl">
                {niche.description || `Découvrez les tendances ${niche.name.toLowerCase()} YouTube les plus prometteuses.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <Badge variant="live" className="text-sm font-bold">
              {trendCount} tendances actives
            </Badge>
            {niche.keywords?.[0] && (
              <Badge variant="outline" className="text-sm">
                {niche.keywords[0]}
              </Badge>
            )}
          </div>
        </section>

        <Separator className="mb-16" />

        {/* Top Trends Section */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl md:text-3xl font-bold">Top 10 Tendances</h2>
            <Link href="/login" className="text-sm font-bold text-yt-red hover:text-yt-red-deep transition-colors">
              Voir tout →
            </Link>
          </div>

          {niche.trends.length > 0 ? (
            <div className="grid gap-4">
              {niche.trends.map((trend, index) => (
                <div
                  key={trend.id}
                  className="p-6 bg-dark-surface border border-hairline-dark hover:border-yt-red/30 transition-colors group"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-yt-red flex items-center justify-center font-black text-white text-sm">
                      #{index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-lg truncate">{trend.title}</h3>
                        <Badge
                          variant={trend.score >= 80 ? "live" : "outline"}
                          className="flex-shrink-0"
                        >
                          Score: {trend.score}
                        </Badge>
                      </div>
                      {trend.description && (
                        <p className="text-dark-ink-secondary text-sm mb-3 line-clamp-2">
                          {trend.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs text-dark-ink-tertiary">
                        {trend.velocity && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Vélocité: {trend.velocity.toFixed(1)}%
                          </span>
                        )}
                        {trend.searchVolume && (
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            Volume: {trend.searchVolume.toLocaleString("fr-FR")}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Détecté: {new Date(trend.detectedAt).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                      {trend.contentAngles && trend.contentAngles.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {trend.contentAngles.slice(0, 3).map((angle, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {angle}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-dark-surface border border-hairline-dark">
              <TrendingUp className="w-12 h-12 text-dark-ink-tertiary mx-auto mb-4" />
              <p className="text-dark-ink-secondary mb-4">
                Aucune tendance active dans cette niche pour le moment.
              </p>
              <p className="text-sm text-dark-ink-tertiary">
                Revenez plus tard ou explorez d'autres niches.
              </p>
            </div>
          )}
        </section>

        {/* FAQ Section */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Questions fréquentes</h2>
          <div className="space-y-6">
            {faqSchema.map((faq, index) => (
              <div key={index} className="p-6 bg-dark-surface border border-hairline-dark">
                <h3 className="font-bold text-lg mb-2">{faq.question}</h3>
                <p className="text-dark-ink-secondary">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center py-12 bg-dark-surface border border-hairline-dark">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Prêt à détecter les tendances avant qu'elles n'explosent ?
          </h2>
          <p className="text-dark-ink-secondary mb-6 max-w-xl mx-auto">
            Rejoignez +1200 créateurs qui font confiance à TrendHunter pour anticiper les tendances YouTube.
          </p>
          <Link href="/login">
            <Button variant="subscribe" size="lg" className="h-12 px-10 font-bold">
              COMMENCER L'ANALYSE
            </Button>
          </Link>
        </section>

        {/* Back to Niches */}
        <div className="mt-12 text-center">
          <Link href="/niches" className="inline-flex items-center gap-2 text-dark-ink-secondary hover:text-dark-ink transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Voir toutes les niches
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-hairline-dark bg-dark-canvas mt-16">
        <div className="max-w-[1400px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="bg-dark-surface-overlay p-1">
              <Play className="w-4 h-4 text-dark-ink-secondary fill-current" />
            </div>
            <span className="font-bold">TrendHunter</span>
          </div>

          <div className="flex gap-8 text-sm text-dark-ink-secondary font-medium">
            <Link href="/niches" className="hover:text-dark-ink">Niches</Link>
            <Link href="/pricing" className="hover:text-dark-ink">Tarifs</Link>
            <Link href="/privacy" className="hover:text-dark-ink">Confidentialité</Link>
          </div>

          <div className="text-dark-ink-tertiary text-xs">
            © {new Date().getFullYear()} TrendHunter. Pour les créateurs, par des créateurs.
          </div>
        </div>
      </footer>
    </div>
  )
}