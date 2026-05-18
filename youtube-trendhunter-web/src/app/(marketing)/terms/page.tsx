import Link from "next/link"
import { Play } from "lucide-react"

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink py-20 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="bg-yt-red p-1 rounded-none">
            <Play className="w-4 h-4 text-white fill-current" />
          </div>
          <span className="text-xl font-bold">TrendHunter</span>
        </Link>
        <h1 className="text-4xl font-bold">Conditions Générales d&apos;Utilisation</h1>
        <div className="prose prose-invert max-w-none space-y-4 text-dark-ink-secondary">
          <p>Dernière mise à jour : {new Date().getFullYear()}</p>
          <h2 className="text-dark-ink text-xl font-bold">1. Acceptation des conditions</h2>
          <p>En utilisant TrendHunter, vous acceptez ces CGU. Si vous n&apos;êtes pas d&apos;accord, veuillez ne pas utiliser le service.</p>
          <h2 className="text-dark-ink text-xl font-bold">2. Description du service</h2>
          <p>TrendHunter est une plateforme d&apos;analyse de tendances YouTube. Nous fournissons des données et des insights basés sur l&apos;analyse de contenu public YouTube.</p>
          <h2 className="text-dark-ink text-xl font-bold">3. Abonnements</h2>
          <p>Les abonnements sont gérés via Stripe. Vous pouvez annuler à tout moment. Les remboursements sont évalués au cas par cas.</p>
          <h2 className="text-dark-ink text-xl font-bold">4. Propriété intellectuelle</h2>
          <p>La plateforme, son code, son design et ses algorithmes sont la propriété exclusive de TrendHunter.</p>
          <h2 className="text-dark-ink text-xl font-bold">5. Limitation de responsabilité</h2>
          <p>TrendHunter fournit des données analytiques à titre indicatif. Nous ne garantissons pas les résultats de votre chaîne YouTube.</p>
        </div>
      </div>
    </div>
  )
}
