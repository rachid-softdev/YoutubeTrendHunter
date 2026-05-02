import Link from "next/link"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"

const plans = [
  {
    name: "Free",
    price: "0€",
    period: "/mois",
    description: "Pour découvrir TrendHunter",
    features: [
      "1 niche suivie",
      "5 tendances par niche",
      "Access extension Chrome",
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
    cta: "Contact commercial",
    href: "mailto:contact@trendhunter.app",
    popular: false,
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">Tarifs</h1>
          <p className="text-xl text-gray-600">
            Choisissez le plan qui correspond à vos besoins
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`bg-white rounded-2xl p-8 ${
                plan.popular ? "ring-2 ring-black scale-105" : "border"
              }`}
            >
              {plan.popular && (
                <span className="bg-black text-white text-xs font-medium px-2 py-1 rounded-full">
                  Populaire
                </span>
              )}

              <h2 className="text-2xl font-bold mt-4">{plan.name}</h2>
              <div className="mt-4">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-gray-500">{plan.period}</span>
              </div>
              <p className="text-gray-500 mt-2">{plan.description}</p>

              <ul className="mt-8 space-y-4">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href={plan.href} className="block mt-8">
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}