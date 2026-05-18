import Link from "next/link"
import { Play } from "lucide-react"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink py-20 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="bg-yt-red p-1 rounded-none">
            <Play className="w-4 h-4 text-white fill-current" />
          </div>
          <span className="text-xl font-bold">TrendHunter</span>
        </Link>
        <h1 className="text-4xl font-bold">Politique de confidentialité</h1>
        <div className="prose prose-invert max-w-none space-y-4 text-dark-ink-secondary">
          <p>Dernière mise à jour : {new Date().getFullYear()}</p>
          <h2 className="text-dark-ink text-xl font-bold">Collecte de données</h2>
          <p>Nous collectons uniquement les données nécessaires au fonctionnement du service : email, nom, préférences de niches, et données d&apos;utilisation de la plateforme.</p>
          <h2 className="text-dark-ink text-xl font-bold">Utilisation des données</h2>
          <p>Vos données sont utilisées exclusivement pour vous fournir le service TrendHunter : détection de tendances, alertes personnalisées, et amélioration du service.</p>
          <h2 className="text-dark-ink text-xl font-bold">Partage des données</h2>
          <p>Vos données ne sont jamais vendues à des tiers. Nous partageons uniquement les informations nécessaires avec nos sous-traitants (Stripe pour les paiements, Resend pour les emails).</p>
          <h2 className="text-dark-ink text-xl font-bold">Vos droits</h2>
          <p>Vous pouvez à tout moment accéder, modifier ou supprimer vos données depuis votre espace personnel. Pour toute question : contact@trendhunter.app</p>
        </div>
      </div>
    </div>
  )
}
