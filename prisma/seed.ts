import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const niches = [
    {
      slug: "finance-personnelle",
      name: "Finance personnelle",
      keywords: ["budget", "épargne", "investissement", "retraite", "finances perso"],
      language: "fr",
    },
    {
      slug: "tech-ia",
      name: "Tech & IA",
      keywords: ["intelligence artificielle", "LLM", "agents IA", "programmation", "no-code"],
      language: "fr",
    },
    {
      slug: "fitness",
      name: "Fitness",
      keywords: ["musculation", "perte de poids", "cardio", "nutrition sportive", "programme"],
      language: "fr",
    },
    {
      slug: "cuisine",
      name: "Cuisine",
      keywords: ["recettes", "batch cooking", "régime", "pâtisserie", "végétarien"],
      language: "fr",
    },
    {
      slug: "business-en-ligne",
      name: "Business en ligne",
      keywords: ["dropshipping", "freelance", "side hustle", "e-commerce", "revenus passifs"],
      language: "fr",
    },
  ]

  for (const niche of niches) {
    await prisma.niche.upsert({
      where: { slug: niche.slug },
      update: niche,
      create: niche,
    })
  }

  console.log("✅ Niches créées")

  const nichesData = await prisma.niche.findMany()

  const testTrends = [
    {
      nicheId: nichesData.find(n => n.slug === "finance-personnelle")?.id,
      title: "Investir dans l'or en 2024",
      description: "Guide complet pour investir dans l'or",
      score: 85,
      velocity: 45.5,
      status: "GROWING",
      searchVolume: 12500,
      videoCount: 234,
      avgViews: 45000,
      contentAngles: ["Comment acheter de l'or", "OR vs actions", "Les meilleures offres"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      nicheId: nichesData.find(n => n.slug === "finance-personnelle")?.id,
      title: "Cryptomonnaies pour débutants",
      description: "Tout savoir sur le Bitcoin et les cryptos",
      score: 72,
      velocity: 28.3,
      status: "EMERGING",
      searchVolume: 8900,
      videoCount: 567,
      avgViews: 23000,
      contentAngles: ["Acheter Bitcoin facilement", "Wallet cryptoconseils"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      nicheId: nichesData.find(n => n.slug === "tech-ia")?.id,
      title: "ChatGPT prompts avancés",
      description: "Maîtrisez l'IA pour gagner du temps",
      score: 92,
      velocity: 156.7,
      status: "PEAK",
      searchVolume: 45000,
      videoCount: 890,
      avgViews: 78000,
      contentAngles: ["Meilleurs prompts ChatGPT", "Automatiser votre travail", "IA pour coder"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      nicheId: nichesData.find(n => n.slug === "tech-ia")?.id,
      title: "No-code tools 2024",
      description: "Créez sans programmer",
      score: 68,
      velocity: 34.2,
      status: "GROWING",
      searchVolume: 6700,
      videoCount: 345,
      avgViews: 18000,
      contentAngles: ["Bubble vs FlutterFlow", "Automatiser sans code"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      nicheId: nichesData.find(n => n.slug === "fitness")?.id,
      title: "Programme musculation à la maison",
      description: "Sans équipement, des résultats",
      score: 78,
      velocity: 89.4,
      status: "PEAK",
      searchVolume: 23000,
      videoCount: 456,
      avgViews: 56000,
      contentAngles: ["Programme gratuit 30 jours", "Poids du corps uniquement", "Progrès rapide"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      nicheId: nichesData.find(n => n.slug === "cuisine")?.id,
      title: "Batch cooking hebdomadaire",
      description: "Gagnez du temps en cuisine",
      score: 65,
      velocity: 22.1,
      status: "EMERGING",
      searchVolume: 5400,
      videoCount: 289,
      avgViews: 34000,
      contentAngles: ["5 repas en 2h", "Économie et santé"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  ]

  for (const trend of testTrends) {
    if (trend.nicheId) {
      const { nicheId, ...trendData } = trend
      await prisma.trend.create({
        data: {
          ...trendData,
          niche: { connect: { id: nicheId } },
        } as any,
      }).catch(() => {
        // Ignore if already exists
      })
    }
  }

  console.log("✅ Tendances de test créées")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())