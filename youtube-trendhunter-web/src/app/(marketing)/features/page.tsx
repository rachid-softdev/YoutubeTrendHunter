import type { Metadata } from "next";
import Link from "next/link";
import {
  Play,
  TrendingUp,
  Sparkles,
  Bell,
  BarChart3,
  Target,
  Rocket,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Fonctionnalités - TrendHunter",
  description:
    "Découvrez toutes les fonctionnalités de TrendHunter : détection de tendances IA, alertes en temps réel, extension Chrome, analytics avancés.",
  openGraph: {
    title: "Fonctionnalités TrendHunter",
    description: "Tous les outils pour grow votre chaîne YouTube",
    url: "/features",
    type: "website",
  },
};

const features = [
  {
    icon: TrendingUp,
    title: "Détection de Tendances IA",
    description:
      "Notre algorithme analyse des millions de vidéos YouTube pour identifier les tendances émergentes avant qu'elles n'explosent.",
    highlights: ["Analyse en temps réel", "Score de potencial", "Prédictions 48h"],
    color: "text-yt-red",
    bgColor: "bg-yt-red/10",
  },
  {
    icon: Sparkles,
    title: "Angles de Contenu IA",
    description:
      "L'IA génère automatiquement des angles de vidéo adaptés à chaque tendance, avec des titres accrocheurs et des hooks.",
    highlights: ["3 angles par tendance", "Titres optimisés", "Hooks prêts à utiliser"],
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    icon: Bell,
    title: "Alertes en Temps Réel",
    description:
      "Soyez le premier prévient quand une niche commence à buzzer. Notifications email, Slack ou webhook.",
    highlights: ["Seuils personnalisables", "Multi-canaux", "Filtres par niche"],
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
  },
  {
    icon: BarChart3,
    title: "Extension Chrome",
    description:
      "Accédez aux données TrendHunter directement depuis YouTube. Analysez les vidéos sans quitter la plateforme.",
    highlights: ["Side panel intégré", "Stats sous chaque vidéo", "Détection de niche auto"],
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: Target,
    title: "Filtrage par Niche",
    description:
      "Suivez les niches qui vous intéressent. Tech, Finance, Fitness, Cuisine... Vous gardé le contrôle.",
    highlights: ["5 niches incluses", "Niches illimitées (Pro)", "Ajout personnalisé"],
    color: "text-green-400",
    bgColor: "bg-green-500/10",
  },
  {
    icon: Rocket,
    title: "Export et Intégrations",
    description:
      "Exportez vos données en CSV, intégrez avec Zapier, ou utilisez notre API pour automatiser vos workflows.",
    highlights: ["Export CSV", "API complete", "Webhooks Zapier"],
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
  },
];

const comparisons = [
  {
    feature: "Tendances illimitées",
    trendhunter: true,
    vidiq: true,
    tubebuddy: true,
  },
  {
    feature: "Alertes temps réel",
    trendhunter: true,
    vidiq: "Partiel",
    tubebuddy: false,
  },
  {
    feature: "Angles de contenu IA",
    trendhunter: true,
    vidiq: false,
    tubebuddy: false,
  },
  {
    feature: "Extension Chrome",
    trendhunter: true,
    vidiq: true,
    tubebuddy: true,
  },
  {
    feature: "API access",
    trendhunter: true,
    vidiq: false,
    tubebuddy: false,
  },
  {
    feature: "Support français",
    trendhunter: true,
    vidiq: false,
    tubebuddy: false,
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink selection:bg-yt-red/30">
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
            <Link href="/features" className="text-dark-ink font-medium">
              Fonctionnalités
            </Link>
            <Link href="/pricing" className="hover:text-dark-ink transition-colors">
              Tarifs
            </Link>
            <Link href="/blog" className="hover:text-dark-ink transition-colors">
              Blog
            </Link>
          </nav>

          <Link href="/login">
            <Button variant="subscribe" size="default" className="font-bold">
              ESSAYER Gratuitement
            </Button>
          </Link>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="py-20 px-4 text-center relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-yt-red/10 blur-[120px] rounded-full pointer-events-none" />

          <div className="max-w-[1400px] mx-auto relative z-10">
            <Badge className="mb-6 bg-yt-red/20 text-yt-red border-yt-red/30">
              <Sparkles className="w-3 h-3 mr-1" />
              FONCTIONNALITÉS
            </Badge>

            <h1 className="text-4xl md:text-6xl font-black mb-6">
              L&apos;arsenal complet du <span className="text-yt-red">créateur moderne</span>
            </h1>

            <p className="text-lg text-dark-ink-secondary max-w-2xl mx-auto mb-10">
              Des outils conçus pour vous donner un avantage compétitif sur YouTube. Pas des
              fonctionnalités inutiles, que de la valeur réelle.
            </p>

            <div className="flex items-center justify-center gap-4">
              <Link href="/login">
                <Button variant="subscribe" size="lg" className="h-12 px-8 font-bold">
                  COMmencer Gratuit
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" size="lg" className="h-12 px-8 font-bold">
                  Voir les tarifs
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 px-4 bg-dark-surface/30 border-y border-hairline-dark">
          <div className="max-w-[1400px] mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Tout ce dont vous avez besoin</h2>
              <p className="text-dark-ink-secondary max-w-2xl mx-auto">
                Chaque fonctionnalité a été pensée pour résoudre un problème réel des créateurs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, idx) => (
                <div
                  key={idx}
                  className="group p-8 bg-dark-canvas border border-hairline-dark hover:border-yt-red/50 transition-all hover:-translate-y-2"
                >
                  <div
                    className={`w-14 h-14 ${feature.bgColor} flex items-center justify-center mb-6 border border-hairline-dark group-hover:border-yt-red/30 transition-colors`}
                  >
                    <feature.icon className={`w-7 h-7 ${feature.color}`} />
                  </div>

                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>

                  <p className="text-dark-ink-secondary mb-6">{feature.description}</p>

                  <ul className="space-y-2">
                    {feature.highlights.map((highlight, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className={`w-4 h-4 ${feature.color}`} />
                        <span className="text-dark-ink-secondary">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-20 px-4">
          <div className="max-w-[1400px] mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Comment on se compare</h2>
              <p className="text-dark-ink-secondary max-w-2xl mx-auto">
                Face aux autres outils du marché, TrendHunter offre plus pour moins.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-hairline-dark">
                    <th className="text-left p-4 font-bold">Fonctionnalité</th>
                    <th className="p-4 font-bold text-center">
                      <span className="text-yt-red">TrendHunter</span>
                    </th>
                    <th className="p-4 font-bold text-center text-dark-ink-secondary">VidIQ</th>
                    <th className="p-4 font-bold text-center text-dark-ink-secondary">TubeBuddy</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((item, idx) => (
                    <tr key={idx} className="border-b border-hairline-dark">
                      <td className="p-4 font-medium">{item.feature}</td>
                      <td className="p-4 text-center">
                        {item.trendhunter === true && (
                          <Check className="w-5 h-5 text-yt-red mx-auto" />
                        )}
                        {item.trendhunter === false && (
                          <span className="text-dark-ink-tertiary">—</span>
                        )}
                        {typeof item.trendhunter === "string" && (
                          <span className="text-sm text-yellow-400">{item.trendhunter}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {item.vidiq === true && (
                          <Check className="w-5 h-5 text-green-500 mx-auto" />
                        )}
                        {item.vidiq === false && <span className="text-dark-ink-tertiary">—</span>}
                        {typeof item.vidiq === "string" && (
                          <span className="text-sm text-dark-ink-tertiary">{item.vidiq}</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {item.tubebuddy === true && (
                          <Check className="w-5 h-5 text-green-500 mx-auto" />
                        )}
                        {item.tubebuddy === false && (
                          <span className="text-dark-ink-tertiary">—</span>
                        )}
                        {typeof item.tubebuddy === "string" && (
                          <span className="text-sm text-dark-ink-tertiary">{item.tubebuddy}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Testimonials Preview */}
        <section className="py-20 px-4 bg-dark-surface/30 border-y border-hairline-dark">
          <div className="max-w-[1400px] mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Ce que disent les créateurs</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  quote:
                    "TrendHunter m'a permis de repérer la tendance AI avant qu'elle n'explose. En 3 mois, j'ai gagné 50K abonnés.",
                  author: "Marc T.",
                  role: "Chaîne Tech, 120K abonnés",
                },
                {
                  quote:
                    "Les alertes en temps réel sont un game-changer. Je sais maintenant quand publier pour maximum d'impact.",
                  author: "Sophie L.",
                  role: "Créatrice Fitness, 85K abonnés",
                },
                {
                  quote:
                    "L'extension Chrome est parfaite. Je reste sur YouTube mais j'ai toutes les données sous la main.",
                  author: "Alex R.",
                  role: "YouTubeur Finance, 200K abonnés",
                },
              ].map((testimonial, idx) => (
                <div key={idx} className="p-6 bg-dark-canvas border border-hairline-dark">
                  <p className="text-dark-ink-secondary mb-6 italic">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  <div>
                    <p className="font-bold">{testimonial.author}</p>
                    <p className="text-sm text-dark-ink-tertiary">{testimonial.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 text-center">
          <div className="max-w-[800px] mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Prêt à prendre de l&apos;avance ?
            </h2>
            <p className="text-lg text-dark-ink-secondary mb-10">
              Rejoignez les créateurs qui utilisent TrendHunter pour stay ahead de
              l&apos;algorithme.
            </p>
            <Link href="/login">
              <Button variant="subscribe" size="lg" className="h-14 px-12 text-lg font-bold">
                COMmencer Gratuitement
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
          </div>
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
            <Link href="/pricing" className="hover:text-dark-ink">
              Tarifs
            </Link>
            <Link href="/privacy" className="hover:text-dark-ink">
              Confidentialité
            </Link>
            <Link href="/terms" className="hover:text-dark-ink">
              CGU
            </Link>
          </div>

          <div className="text-dark-ink-tertiary text-xs">
            © {new Date().getFullYear()} TrendHunter.
          </div>
        </div>
      </footer>
    </div>
  );
}
