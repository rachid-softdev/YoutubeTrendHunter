import type { Metadata } from "next";
import Link from "next/link";
import { Play } from "lucide-react";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation - TrendHunter",
  description:
    "Conditions Générales d'Utilisation du service TrendHunter : acceptation, description du service, abonnements, propriété intellectuelle et limitations.",
  alternates: { canonical: "/terms" },
};

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
        <p className="text-dark-ink-secondary">Dernière mise à jour : 27 août 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-dark-ink-secondary">
          <p>
            <strong className="text-dark-ink">En utilisant TrendHunter, vous acceptez les présentes
            conditions générales d&apos;utilisation.</strong> En vous inscrivant, en vous connectant
            ou en utilisant le service (notamment la plateforme web et l&apos;extension Chrome),
            vous reconnaissez avoir lu, compris et accepté l&apos;intégralité des dispositions
            ci-dessous.
          </p>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">1. Éditeur et acceptation</h2>
            <p>
              TrendHunter est édité par Rachid Softdev (micro-entrepreneur), dont les informations
              complètes figurent sur la page{" "}
              <Link href="/mentions-legales" className="text-yt-red underline underline-offset-2">
                Mentions légales
              </Link>
              . Si vous n&apos;acceptez pas ces conditions, veuillez ne pas utiliser le service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">2. Description du service</h2>
            <p>
              TrendHunter est une plateforme d&apos;analyse de tendances YouTube. Nous fournissons
              des données et des insights basés sur l&apos;analyse de contenu public YouTube. Le
              service comprend un tableau de bord web, une extension Chrome, des alertes
              personnalisées et l&apos;accès à une API pour certaines formules.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">3. Conditions d&apos;âge et compte</h2>
            <p>
              Le service est réservé aux personnes majeures ou, pour les mineurs, aux personnes
              disposant de l&apos;autorisation de leurs représentants légaux. Vous êtes responsable
              de la confidentialité de votre compte et des actions effectuées depuis celui-ci.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">4. Abonnements et paiement</h2>
            <p>
              Les abonnements payants (plans Pro et Team) sont souscrits via Stripe. Les prix sont
              exprimés en euros, TVA non applicable (micro-entrepreneur). Les abonnements sont
              reconductibles mensuellement et vous pouvez annuler à tout moment depuis votre espace
              client Stripe. L&apos;annulation prend effet à la fin de la période en cours.
            </p>
            <p>
              Conformément à l&apos;article L221-28 du Code de la consommation, le droit de
              rétractation de 14 jours ne s&apos;applique pas aux contenus numériques fournis
              immédiatement après la souscription et après acceptation préalable de la renonciation
              au droit de rétractation.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">5. Propriété intellectuelle</h2>
            <p>
              La plateforme, son code, son design, ses algorithmes et tous les contenus produits
              (à l&apos;exception des données YouTube) sont la propriété exclusive de TrendHunter.
              Toute reproduction ou exploitation non autorisée est interdite.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">6. Limitation de responsabilité</h2>
            <p>
              TrendHunter fournit des données analytiques à titre indicatif. Nous ne garantissons
              ni l&apos;exactitude des données, ni les résultats de votre chaîne YouTube.
              L&apos;utilisation du service se fait à vos risques et périls.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">7. Données personnelles</h2>
            <p>
              Le traitement de vos données est décrit dans notre{" "}
              <Link href="/privacy" className="text-yt-red underline underline-offset-2">
                Politique de confidentialité
              </Link>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">8. Suspension et résiliation</h2>
            <p>
              Nous nous réservons le droit de suspendre ou de résilier l&apos;accès d&apos;un
              utilisateur en cas de non-respect des présentes conditions, de fraude ou d&apos;abus.
              Vous pouvez supprimer votre compte à tout moment depuis vos paramètres.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">9. Droit applicable et litiges</h2>
            <p>
              Les présentes conditions sont soumises au droit français. En cas de litige, les
              parties s&apos;efforceront de trouver une solution amiable. À défaut, le litige sera
              porté devant les tribunaux compétents français. Conformément à l&apos;article 14 du
              règlement (UE) n°524/2013, vous pouvez recourir à la plateforme européenne de
              règlement en ligne des litiges : https://ec.europa.eu/consumers/odr.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">10. Contact</h2>
            <p>
              Pour toute question relative aux présentes CGU, contactez-nous à :
              contact@trendhunter.app.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
