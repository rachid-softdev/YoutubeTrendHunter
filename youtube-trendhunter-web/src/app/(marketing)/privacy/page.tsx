import type { Metadata } from "next";
import Link from "next/link";
import { Play } from "lucide-react";

export const metadata: Metadata = {
  title: "Politique de confidentialité - TrendHunter",
  description:
    "Politique de confidentialité de TrendHunter : quelles données nous collectons, comment nous les utilisons et quels sont vos droits.",
  alternates: { canonical: "/privacy" },
};

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
        <p className="text-dark-ink-secondary">Dernière mise à jour : 27 août 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-dark-ink-secondary">
          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">1. Éditeur du service</h2>
            <p>
              TrendHunter est édité par Rachid Softdev (micro-entrepreneur), contact :
              contact@trendhunter.app. Les mentions légales complètes sont disponibles sur la page{" "}
              <Link href="/mentions-legales" className="text-yt-red underline underline-offset-2">
                Mentions légales
              </Link>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">2. Données collectées</h2>
            <p>Nous collectons uniquement les données nécessaires au fonctionnement du service :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong className="text-dark-ink">Données d&apos;identité</strong> : nom, adresse
                email, photo de profil (fournies par votre compte Google lors de la connexion).
              </li>
              <li>
                <strong className="text-dark-ink">Préférences</strong> : niches suivies, alertes
                configurées, paramètres de compte.
              </li>
              <li>
                <strong className="text-dark-ink">Données d&apos;utilisation</strong> : tendances
                consultées, pages visitées, actions effectuées sur la plateforme.
              </li>
              <li>
                <strong className="text-dark-ink">Données techniques</strong> : adresse IP,
                journaux d&apos;audit, identifiant de session lors de nos opérations de sécurité et
                de traçabilité.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">3. Utilisation des données</h2>
            <p>Vos données sont utilisées exclusivement pour :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Vous fournir le service TrendHunter (détection de tendances, alertes, extension).</li>
              <li>Gérer votre compte et votre abonnement.</li>
              <li>Améliorer le service et l&apos;expérience utilisateur.</li>
              <li>Vous envoyer des notifications liées au service (email, alertes).</li>
              <li>Assurer la sécurité de la plateforme.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">4. Partage des données</h2>
            <p>
              Vos données ne sont jamais vendues à des tiers. Nous faisons appel aux sous-traitants
              suivants, dans le strict nécessaire au fonctionnement du service :
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong className="text-dark-ink">Stripe</strong> (paiements) — nom, email, identifiant
                de client.
              </li>
              <li>
                <strong className="text-dark-ink">Resend</strong> (envoi d&apos;emails) — adresse email.
              </li>
              <li>
                <strong className="text-dark-ink">PostHog</strong> (analytics) — identifiant
                utilisateur, nom, email et événements de navigation. Cette collecte est soumise à
                votre consentement préalable via notre bandeau cookies.
              </li>
              <li>
                <strong className="text-dark-ink">Sentry</strong> (monitoring d&apos;erreurs) — données
                techniques de débogage.
              </li>
              <li>
                <strong className="text-dark-ink">Google</strong> (authentification OAuth) — données
                de votre profil Google.
              </li>
            </ul>
            <p>
              Ces sous-traitants peuvent être situés aux États-Unis. Les transferts s&apos;effectuent
              sur la base des garanties appropriées prévues par le RGPD (clauses contractuelles
              types ou certifications de protection adéquate).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">5. Durée de conservation</h2>
            <p>
              Vos données sont conservées pendant toute la durée de votre utilisation du service.
              À la suppression de votre compte, l&apos;ensemble de vos données sont supprimées de nos
              bases de données. Les journaux d&apos;audit sont conservés au maximum 12 mois à des fins
              de sécurité.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">6. Vos droits</h2>
            <p>Conformément au RGPD, vous disposez des droits suivants :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Droit d&apos;accès à vos données.</li>
              <li>Droit de rectification.</li>
              <li>Droit à l&apos;effacement (suppression de compte dans vos paramètres).</li>
              <li>Droit à la portabilité (export de vos données).</li>
              <li>
                Droit d&apos;opposition et de retrait de votre consentement (cookies, analytics).
              </li>
              <li>Droit d&apos;introduire une réclamation auprès de la CNIL.</li>
            </ul>
            <p>
              Pour exercer ces droits, contactez-nous à l&apos;adresse : contact@trendhunter.app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">7. Cookies</h2>
            <p>
              Nous utilisons des cookies essentiels au fonctionnement du service ainsi que des
              cookies d&apos;analyse (PostHog) soumis à votre consentement. Pour en savoir plus,
              consultez notre{" "}
              <Link href="/cookies" className="text-yt-red underline underline-offset-2">
                politique de cookies
              </Link>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">8. Sécurité</h2>
            <p>
              Nous mettons en œuvre des mesures de sécurité techniques et organisationnelles
              appropriées pour protéger vos données : chiffrement en transit (HTTPS), sessions
              sécurisées, hachage des jetons d&apos;API, et accès restreint aux bases de données.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">9. Contact</h2>
            <p>
              Pour toute question relative à la présente politique ou à vos données personnelles,
              vous pouvez nous écrire à : contact@trendhunter.app.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
