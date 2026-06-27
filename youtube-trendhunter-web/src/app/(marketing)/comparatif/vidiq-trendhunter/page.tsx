import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check, X, ArrowRight, Play, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "vidIQ vs TrendHunter - Comparatif 2026 | TrendHunter",
  description:
    "Comparaison approfondie entre vidIQ et TrendHunter. Découvrez quelle outil de détection de tendances YouTube est le meilleur en 2026. Analyse des fonctionnalités, prix et performances.",
  keywords: [
    "vidIQ vs TrendHunter",
    "vidIQ alternative",
    "comparatif vidIQ TrendHunter",
    "meilleur outil youtube 2026",
    "vidIQ review",
    "TrendHunter vs vidIQ",
  ],
  openGraph: {
    title: "vidIQ vs TrendHunter - Le comparatif définitif 2026",
    description: "Quelle outil de détection de tendances YouTube choisir ? Analyse complète.",
    url: "https://trendhunter.app/comparatif/vidiq-trendhunter",
    siteName: "TrendHunter",
    locale: "fr_FR",
    type: "website",
  },
  alternates: {
    canonical: "https://trendhunter.app/comparatif/vidiq-trendhunter",
  },
};

// Feature comparison
const comparisonFeatures = [
  { feature: "Détection de tendances IA", vidIQ: true, trendHunter: true },
  { feature: "Analyse en temps réel", vidIQ: true, trendHunter: true },
  { feature: "Extension Chrome", vidIQ: true, trendHunter: true },
  { feature: "Angles de contenu IA", vidIQ: false, trendHunter: true },
  { feature: "Niches françaises", vidIQ: false, trendHunter: true },
  { feature: "Alertes automatiques", vidIQ: true, trendHunter: true },
  { feature: "Prix gratuit", vidIQ: "limité", trendHunter: true },
  { feature: "Support français", vidIQ: false, trendHunter: true },
];

// FAQ for JSON-LD
const faqSchema = [
  {
    question: "vidIQ est-il gratuit ?",
    answer:
      "vidIQ propose une version gratuite avec des fonctionnalités limitées. La version payante commence à 19$/mois. TrendHunter offre un plan gratuit plus généreux.",
  },
  {
    question: "Quelle outil est meilleur pour les créateurs français ?",
    answer:
      "TrendHunter est spécifiquement conçu pour le marché francophone avec des niches本地isées et un support en français. vidIQ est principalement orienté anglophone.",
  },
  {
    question: "TrendHunter dispose-t-il d'une extension Chrome ?",
    answer:
      "Oui, TrendHunter propose une extension Chrome gratuite qui affiche les données de tendance directement sous chaque vidéo YouTube.",
  },
];

export default function VidIQComparisonPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
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
  };

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
            <Link href="/niches" className="hover:text-dark-ink transition-colors">
              Niches
            </Link>
            <Link href="/pricing" className="hover:text-dark-ink transition-colors">
              Tarifs
            </Link>
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
            <Link href="/" className="hover:text-dark-ink transition-colors">
              Accueil
            </Link>
            <span>/</span>
            <Link href="/pricing" className="hover:text-dark-ink transition-colors">
              Tarifs
            </Link>
            <span>/</span>
            <span className="text-dark-ink font-medium">Comparatif vidIQ</span>
          </div>
        </nav>

        {/* Hero */}
        <section className="text-center mb-16">
          <Badge variant="live" className="mb-4">
            COMPARATIF 2026
          </Badge>
          <h1 className="text-4xl md:text-5xl font-black mb-4">
            vidIQ <span className="text-dark-ink-tertiary">vs</span> TrendHunter
          </h1>
          <p className="text-dark-ink-secondary text-lg max-w-2xl mx-auto mb-8">
            Le comparatif définitif entre les deux outils de détection de tendances YouTube les plus
            populaires.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login">
              <Button variant="subscribe" size="lg" className="h-12 px-8 font-bold">
                Essayer TrendHunter
                <Zap className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Button variant="outline" size="lg" className="h-12 px-8 font-bold">
              Comparer les tarifs
            </Button>
          </div>
        </section>

        <Separator className="mb-16" />

        {/* Comparison Table */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
            Comparaison des fonctionnalités
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-hairline-dark">
                  <th className="text-left py-4 px-4 font-bold text-dark-ink-secondary">
                    Fonctionnalité
                  </th>
                  <th className="text-center py-4 px-4 font-bold w-48">
                    <span className="text-yt-red">vidIQ</span>
                  </th>
                  <th className="text-center py-4 px-4 font-bold w-48">
                    <span className="text-yt-red">TrendHunter</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((item, index) => (
                  <tr key={index} className="border-b border-hairline-dark/50">
                    <td className="py-4 px-4 font-medium">{item.feature}</td>
                    <td className="text-center py-4 px-4">
                      {typeof item.vidIQ === "boolean" ? (
                        item.vidIQ ? (
                          <Check className="w-5 h-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-red-500 mx-auto" />
                        )
                      ) : (
                        <span className="text-sm text-dark-ink-tertiary">{item.vidIQ}</span>
                      )}
                    </td>
                    <td className="text-center py-4 px-4">
                      {typeof item.trendHunter === "boolean" ? (
                        item.trendHunter ? (
                          <Check className="w-5 h-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-red-500 mx-auto" />
                        )
                      ) : (
                        <span className="text-sm text-dark-ink-tertiary">{item.trendHunter}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pricing Comparison */}
        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">
            Comparaison des tarifs
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* vidIQ */}
            <div className="p-6 bg-dark-surface border border-hairline-dark">
              <h3 className="text-xl font-bold mb-2">vidIQ</h3>
              <div className="mb-4">
                <span className="text-3xl font-black">19$</span>
                <span className="text-dark-ink-secondary">/mois</span>
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>Plan gratuit limité</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>Essai 7 jours</span>
                </li>
                <li className="flex items-center gap-2 text-dark-ink-tertiary">
                  <X className="w-4 h-4" />
                  <span>Pas de support français</span>
                </li>
              </ul>
            </div>

            {/* TrendHunter */}
            <div className="p-6 bg-dark-surface border border-yt-red/50 relative">
              <Badge variant="live" className="absolute -top-3 left-4 text-[10px] font-bold">
                NOTRE CHOIX
              </Badge>
              <h3 className="text-xl font-bold mb-2">TrendHunter</h3>
              <div className="mb-4">
                <span className="text-3xl font-black">15€</span>
                <span className="text-dark-ink-secondary">/mois</span>
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>Plan gratuit généreux</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>Support français</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>Angles de contenu IA</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Pros & Cons */}
        <section className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* vidIQ Pros/Cons */}
            <div>
              <h3 className="text-xl font-bold mb-4">vidIQ</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-green-500 mb-2">✓ Avantages</h4>
                  <ul className="space-y-1 text-sm text-dark-ink-secondary">
                    <li>• Grande communauté anglophone</li>
                    <li>• Analyses historique des chaines</li>
                    <li>• Outils SEO intégrés</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-red-500 mb-2">✗ Inconvénients</h4>
                  <ul className="space-y-1 text-sm text-dark-ink-secondary">
                    <li>• Pas de support français</li>
                    <li>• Prix plus élevé</li>
                    <li>• Interface complexe pour débutants</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* TrendHunter Pros/Cons */}
            <div>
              <h3 className="text-xl font-bold mb-4">TrendHunter</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-green-500 mb-2">✓ Avantages</h4>
                  <ul className="space-y-1 text-sm text-dark-ink-secondary">
                    <li>• Prix concurrentiel (15€/mois)</li>
                    <li>• Support français réactif</li>
                    <li>• Angles de contenu IA exclusifs</li>
                    <li>• Niches本地isées pour le marché français</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-red-500 mb-2">✗ Inconvénients</h4>
                  <ul className="space-y-1 text-sm text-dark-ink-secondary">
                    <li>• Plus récent sur le marché</li>
                    <li>• Communauté en croissance</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
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

        {/* CTA */}
        <section className="text-center py-12 bg-dark-surface border border-hairline-dark">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Prêt à essayer TrendHunter ?</h2>
          <p className="text-dark-ink-secondary mb-6 max-w-xl mx-auto">
            Profitez du plan gratuit pour tester TrendHunter et détecter les tendances avant vos
            concurrents.
          </p>
          <Link href="/login">
            <Button variant="subscribe" size="lg" className="h-12 px-10 font-bold">
              CRÉER UN COMPTE Gratuit
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <p className="text-sm text-dark-ink-tertiary mt-4">Aucune carte de crédit requise</p>
        </section>

        {/* Related Links */}
        <section className="mt-12 text-center">
          <p className="text-dark-ink-secondary mb-4">Autres comparatifs :</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/comparatif/tubebuddy-trendhunter"
              className="text-yt-red hover:text-yt-red-deep transition-colors font-bold"
            >
              TubeBuddy vs TrendHunter →
            </Link>
            <Link
              href="/comparatif/meilleur-outil-tendances-youtube"
              className="text-yt-red hover:text-yt-red-deep transition-colors font-bold"
            >
              Meilleurs outils tendances YouTube →
            </Link>
          </div>
        </section>
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
            <Link href="/niches" className="hover:text-dark-ink">
              Niches
            </Link>
            <Link href="/pricing" className="hover:text-dark-ink">
              Tarifs
            </Link>
            <Link href="/privacy" className="hover:text-dark-ink">
              Confidentialité
            </Link>
          </div>

          <div className="text-dark-ink-tertiary text-xs">
            © {new Date().getFullYear()} TrendHunter
          </div>
        </div>
      </footer>
    </div>
  );
}
