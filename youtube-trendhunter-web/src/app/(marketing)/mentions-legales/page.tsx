import type { Metadata } from "next";
import Link from "next/link";
import { Play } from "lucide-react";

export const metadata: Metadata = {
  title: "Mentions légales - TrendHunter",
  description: "Mentions légales du site TrendHunter : éditeur, hébergeur, contact.",
  alternates: { canonical: "/mentions-legales" },
};

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink py-20 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="bg-yt-red p-1 rounded-none">
            <Play className="w-4 h-4 text-white fill-current" />
          </div>
          <span className="text-xl font-bold">TrendHunter</span>
        </Link>
        <h1 className="text-4xl font-bold">Mentions légales</h1>
        <p className="text-dark-ink-secondary">Dernière mise à jour : 27 août 2026</p>

        <div className="prose prose-invert max-w-none space-y-6 text-dark-ink-secondary">
          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">1. Éditeur du site</h2>
            <p>Le site TrendHunter est édité par :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong className="text-dark-ink">Rachid Softdev</strong> — micro-entrepreneur
              </li>
              <li>
                SIRET : <em>à compléter</em>
              </li>
              <li>
                Adresse : <em>à compléter</em>
              </li>
              <li>
                Email :{" "}
                <a
                  href="mailto:contact@trendhunter.app"
                  className="text-yt-red underline underline-offset-2"
                >
                  contact@trendhunter.app
                </a>
              </li>
            </ul>
            <p>
              TVA non applicable, article 293 B du Code général des impôts (franchise en base de TVA
              — micro-entrepreneur).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">2. Directeur de la publication</h2>
            <p>Le directeur de la publication est Rachid Softdev.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">3. Hébergement</h2>
            <p>Le site est hébergé chez :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong className="text-dark-ink">Vercel Inc.</strong>
              </li>
              <li>440 N Barranca Ave #4133, Covina, CA 91723, États-Unis</li>
              <li>
                Site :{" "}
                <a
                  href="https://vercel.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-yt-red underline underline-offset-2"
                >
                  https://vercel.com
                </a>
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">4. Propriété intellectuelle</h2>
            <p>
              L&apos;ensemble des contenus du site (textes, design, logos, code) est protégé par le
              droit d&apos;auteur. Toute reproduction sans autorisation est interdite.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">5. Données personnelles</h2>
            <p>
              Le traitement de vos données est décrit dans notre{" "}
              <Link href="/privacy" className="text-yt-red underline underline-offset-2">
                Politique de confidentialité
              </Link>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-dark-ink text-xl font-bold">6. Cookies</h2>
            <p>
              Consultez notre{" "}
              <Link href="/cookies" className="text-yt-red underline underline-offset-2">
                politique de cookies
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
