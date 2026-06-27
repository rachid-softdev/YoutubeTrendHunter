import Link from "next/link";
import { Metadata } from "next";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Blog — Tendances YouTube & Conseils Créateurs | TrendHunter",
  description:
    "Découvrez les analyses de tendances YouTube, guides pratiques et conseils pour créateurs. Rédigé par l'IA TrendHunter. Updates hebdomadaires.",
  keywords: [
    "blog youtube tendances",
    "conseils créateurs youtube",
    "analyse youtube",
    "tendances youtube 2026",
  ],
  openGraph: {
    title: "Blog TrendHunter — Tendances YouTube",
    description: "Actualités, guides et analyses pour les créateurs YouTube.",
    type: "website",
    locale: "fr_FR",
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink selection:bg-yt-red/30">
      {/* --- Header --- */}
      <header className="sticky top-0 z-50 bg-dark-canvas/80 backdrop-blur-md border-b border-hairline-dark">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-yt-red p-1 rounded-none group-hover:bg-yt-red-deep transition-colors">
              <Play className="w-4 h-4 text-white fill-current" />
            </div>
            <span className="text-xl font-bold">TrendHunter</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-dark-ink-secondary">
            <Link href="#features" className="hover:text-dark-ink transition-colors">
              Fonctionnalités
            </Link>
            <Link href="#pricing" className="hover:text-dark-ink transition-colors">
              Tarifs
            </Link>
            <Link href="/blog" className="text-yt-red">
              Blog
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login">
              <Button variant="subscribe" size="default" className="font-bold">
                ESSAYER Gratuitement
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* --- Breadcrumb --- */}
      <div className="border-b border-hairline-dark bg-dark-surface/30">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/"
              className="text-dark-ink-secondary hover:text-dark-ink transition-colors"
            >
              Accueil
            </Link>
            <span className="text-dark-ink-tertiary">/</span>
            <Link
              href="/blog"
              className="text-dark-ink-secondary hover:text-dark-ink transition-colors"
            >
              Blog
            </Link>
            <span className="text-dark-ink-tertiary">/</span>
            <span className="text-dark-ink">Actualités</span>
          </nav>
        </div>
      </div>

      <main>{children}</main>

      {/* --- Footer --- */}
      <footer className="py-12 border-t border-hairline-dark bg-dark-canvas">
        <div className="max-w-[1400px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="bg-dark-surface-overlay p-1 rounded">
              <Play className="w-4 h-4 text-dark-ink-secondary fill-current" />
            </div>
            <span className="font-bold">TrendHunter</span>
          </div>

          <div className="flex gap-8 text-sm text-dark-ink-secondary font-medium">
            <Link href="/blog" className="hover:text-dark-ink">
              Blog
            </Link>
            <Link href="#pricing" className="hover:text-dark-ink">
              Tarifs
            </Link>
            <Link href="/privacy" className="hover:text-dark-ink">
              Confidentialité
            </Link>
            <Link href="/terms" className="hover:text-dark-ink">
              CGU
            </Link>
          </div>

          <div className="text-dark-ink-tertiary text-xs">
            © {new Date().getFullYear()} TrendHunter. Pour les créateurs, par des créateurs.
          </div>
        </div>
      </footer>
    </div>
  );
}
