import type { Metadata } from "next";
import Link from "next/link";
import { Play } from "lucide-react";

export const metadata: Metadata = {
  title: "Politique de cookies - TrendHunter",
  description:
    "Politique de cookies de TrendHunter : quels cookies nous utilisons et comment gérer vos préférences.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink py-20 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="bg-yt-red p-1 rounded-none">
            <Play className="w-4 h-4 text-white fill-current" />
          </div>
          <span className="text-xl font-bold">TrendHunter</span>
        </Link>
        <h1 className="text-4xl font-bold">Politique de cookies</h1>
        <p className="text-dark-ink-secondary">Dernière mise à jour : 27 août 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-dark-ink-secondary">
          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">1. Qu&apos;est-ce qu&apos;un cookie ?</h2>
            <p>
              Un cookie est un petit fichier déposé sur votre appareil lors de la consultation
              d&apos;un site. Il permet de reconnaître votre navigateur et de conserver certaines
              informations.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">2. Cookies utilisés</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong className="text-dark-ink">Cookies essentiels</strong> (techniques) :
                nécessaires au fonctionnement du service (session d&apos;authentification). Ils ne
                requièrent pas votre consentement.
              </li>
              <li>
                <strong className="text-dark-ink">Cookies d&apos;analyse (PostHog)</strong> :
                mesurent l&apos;audience et les comportements d&apos;utilisation afin d&apos;améliorer le
                service. Ils ne sont déposés qu&apos;après votre consentement.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">3. Gestion de vos préférences</h2>
            <p>
              Lors de votre première visite, un bandeau vous permet d&apos;accepter ou de refuser
              les cookies d&apos;analyse. Vous pouvez modifier votre choix à tout moment en
              effaçant les cookies de votre navigateur ou en utilisant les paramètres de votre
              navigateur.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">4. Durée de conservation</h2>
            <p>Les cookies sont conservés pour une durée maximale de 13 mois conformément aux recommandations de la CNIL.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">5. Contact</h2>
            <p>
              Pour toute question relative aux cookies, contactez-nous à : contact@trendhunter.app.
              Pour plus d&apos;informations sur le traitement de vos données, consultez notre{" "}
              <Link href="/privacy" className="text-yt-red underline underline-offset-2">
                Politique de confidentialité
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
