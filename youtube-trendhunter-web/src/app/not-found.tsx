import Link from "next/link";
import { Play, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="bg-dark-surface w-20 h-20 rounded-full flex items-center justify-center mx-auto border border-hairline-dark">
          <Search className="w-10 h-10 text-dark-ink-tertiary" />
        </div>
        <h1 className="text-5xl font-black">404</h1>
        <p className="text-dark-ink-secondary text-lg">
          Cette page n&apos;existe pas ou a été déplacée.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-yt-red hover:bg-yt-red-deep text-white font-bold rounded-full transition-colors"
        >
          <Play className="w-4 h-4 fill-current" />
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
