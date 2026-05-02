import Link from "next/link"
import { TrendingUp, Zap, Bell, BarChart3, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

const features = [
  {
    icon: TrendingUp,
    title: "Tendances en temps réel",
    description: "Détectez les sujets qui montent avant vos concurrents",
  },
  {
    icon: Zap,
    title: "Score IA",
    description: "Évaluez le potentiel de chaque tendance avec notre IA",
  },
  {
    icon: Bell,
    title: "Alertes personnalisées",
    description: "Soyez notifié quand une opportunité se présente",
  },
  {
    icon: BarChart3,
    title: "Extension Chrome",
    description: "Accédez aux tendances directement depuis YouTube",
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            TrendHunter
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm font-medium">
              Tarifs
            </Link>
            <Link href="/login">
              <Button variant="outline">Connexion</Button>
            </Link>
            <Link href="/login">
              <Button>Commencer</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-6">
            Trouvez les tendances YouTube
            <br />
            <span className="text-blue-600">avant qu'il ne soit trop tard</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            TrendHunter analyse des milliers de données pour identifier les tendances
            émergentes et vous proposer des angles de vidéo à fort potentiel.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg">Essayer gratuitement</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg">
                Voir les tarifs
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            Tout ce dont vous avez besoin
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.title} className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-medium mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <footer className="py-12 border-t">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          © 2024 TrendHunter. Tous droits réservés.
        </div>
      </footer>
    </div>
  )
}