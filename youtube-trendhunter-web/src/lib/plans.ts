// Source unique des prix mensuels (EUR) — utilisé par le pricing UI et le calcul MRR admin
export const PRICING = {
  PRO: 15,
  TEAM: 39,
} as const;

export const PLANS = [
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
    features: ["Tout Pro", "5 utilisateurs", "API access", "Webhooks", "Account manager dédié"],
    cta: "Contact commercial",
    href: "mailto:contact@trendhunter.app",
    popular: false,
  },
];
