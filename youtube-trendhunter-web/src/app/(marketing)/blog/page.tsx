import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Play, Clock, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Blog - Conseils et Analyses YouTube | TrendHunter",
  description:
    "Découvrez nos guides, analyses et stratégies pour grew votre chaîne YouTube. Actualités, tutoriels et meilleures pratiques.",
  openGraph: {
    title: "Blog TrendHunter - Ressources pour Créateurs YouTube",
    description: "Conseils, analyses et stratégies pour développer votre chaîne YouTube.",
    url: "/blog",
    type: "website",
  },
  alternates: {
    canonical: "/blog",
  },
};

interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  titleEn?: string;
  subtitle?: string;
  excerpt: string;
  category: string;
  niche: string | null;
  language: string;
  status: string;
  featured: boolean;
  content: {
    fr: {
      sections: Array<{ type: string }>;
      readTime: number;
      difficulty: string;
      tags: string[];
    };
  };
  seo: {
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
  };
  media: {
    coverImage: { url: string; alt: string };
  };
  author: {
    name: string;
    avatar: string;
    bio: string;
  };
  timestamps: {
    publishedAt: string;
    updatedAt: string;
  };
}

interface BlogData {
  meta: { lastUpdated: string; totalArticles: number; version: string };
  categories: Array<{ slug: string; name: string; description: string; color: string }>;
  articles: BlogArticle[];
}

async function getBlogData(): Promise<BlogData | null> {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const articlesPath = path.join(process.cwd(), "content", "blog", "articles.json");

    if (!fs.existsSync(articlesPath)) {
      return null;
    }

    const raw = fs.readFileSync(articlesPath, "utf-8");
    return JSON.parse(raw) as BlogData;
  } catch (error) {
    console.error("Error loading blog data:", error);
    return null;
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case "débutant":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "intermédiaire":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "avancé":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

function getCategoryColor(color: string): string {
  switch (color) {
    case "red":
      return "text-red-400 bg-red-500/10 border-red-500/20";
    case "blue":
      return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    case "green":
      return "text-green-400 bg-green-500/10 border-green-500/20";
    case "purple":
      return "text-purple-400 bg-purple-500/10 border-purple-500/20";
    default:
      return "text-gray-400 bg-gray-500/10 border-gray-500/20";
  }
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const { category, page } = await searchParams;
  const blogData = await getBlogData();

  if (!blogData) {
    notFound();
  }

  const currentPage = parseInt(page || "1", 10);
  const itemsPerPage = 6;
  const totalPages = Math.ceil(blogData.articles.length / itemsPerPage);

  const filteredArticles = category
    ? blogData.articles.filter((a) => a.category === category && a.status === "published")
    : blogData.articles.filter((a) => a.status === "published");

  const paginatedArticles = filteredArticles.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const currentCategory = blogData.categories.find((c) => c.slug === category);

  // JSON-LD for blog
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Blog TrendHunter",
    description: "Conseils et analyses pour les créateurs YouTube",
    url: "https://trendhunter.app/blog",
    blogPost: filteredArticles.map((article) => ({
      "@type": "BlogPosting",
      headline: article.title,
      description: article.excerpt,
      url: `https://trendhunter.app/blog/${article.slug}`,
      datePublished: article.timestamps.publishedAt,
      author: {
        "@type": "Person",
        name: article.author.name,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink selection:bg-yt-red/30">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-dark-canvas/80 backdrop-blur-md border-b border-hairline-dark">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-yt-red p-1 group-hover:bg-yt-red-deep transition-colors">
              <Play className="w-4 h-4 text-white fill-current" />
            </div>
            <span className="text-xl font-bold">TrendHunter</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-dark-ink-secondary">
            <Link href="/niches" className="hover:text-dark-ink transition-colors">
              Niches
            </Link>
            <Link href="/pricing" className="hover:text-dark-ink transition-colors">
              Tarifs
            </Link>
            <Link href="/blog" className="text-dark-ink font-medium">
              Blog
            </Link>
          </nav>

          <Link href="/login">
            <Button variant="subscribe" size="default" className="font-bold">
              ESSAYER Gratuitement
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-12">
        {/* Hero Section */}
        <section className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yt-red/10 border border-yt-red/20 mb-6">
            <Sparkles className="w-4 h-4 text-yt-red" />
            <span className="text-[10px] font-black text-yt-red tracking-[0.2em] uppercase">
              {blogData.meta.totalArticles} Articles
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black mb-4">Blog TrendHunter</h1>
          <p className="text-dark-ink-secondary text-lg max-w-2xl mx-auto">
            Conseils, analyses et stratégies pour développer votre chaîne YouTube.
          </p>
        </section>

        {/* Category Filter */}
        <section className="mb-8">
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href="/blog"
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                !category
                  ? "bg-yt-red text-white"
                  : "bg-dark-surface border border-hairline-dark hover:border-yt-red/50"
              }`}
            >
              Tous
            </Link>
            {blogData.categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/blog?category=${cat.slug}`}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  category === cat.slug
                    ? "bg-yt-red text-white"
                    : "bg-dark-surface border border-hairline-dark hover:border-yt-red/50"
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </section>

        {/* Featured Article */}
        {filteredArticles.length > 0 && currentPage === 1 && !category && (
          <section className="mb-12">
            <Link
              href={`/blog/${filteredArticles[0].slug}`}
              className="block group relative overflow-hidden bg-dark-surface border border-hairline-dark"
            >
              <div className="grid md:grid-cols-2 gap-0">
                <div className="p-8 md:p-12 flex flex-col justify-center">
                  <Badge className="w-fit mb-4 bg-yt-red text-white">À la une</Badge>
                  <h2 className="text-2xl md:text-3xl font-black mb-4 group-hover:text-yt-red transition-colors">
                    {filteredArticles[0].title}
                  </h2>
                  <p className="text-dark-ink-secondary mb-6">{filteredArticles[0].excerpt}</p>
                  <div className="flex items-center gap-4 text-sm text-dark-ink-tertiary">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {filteredArticles[0].content.fr.readTime} min
                    </span>
                    <Badge
                      variant="outline"
                      className={getDifficultyColor(filteredArticles[0].content.fr.difficulty)}
                    >
                      {filteredArticles[0].content.fr.difficulty}
                    </Badge>
                    <span>{formatDate(filteredArticles[0].timestamps.publishedAt)}</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-yt-red/20 to-yt-link/20 flex items-center justify-center p-8 min-h-[300px]">
                  <div className="w-20 h-20 bg-yt-red/20 rounded-full flex items-center justify-center">
                    <Play className="w-10 h-10 text-yt-red" />
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Current Category Title */}
        {currentCategory && (
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-sm border ${getCategoryColor(currentCategory.color)}`}
              >
                {currentCategory.name}
              </span>
            </h2>
            <p className="text-dark-ink-secondary mt-2">{currentCategory.description}</p>
          </div>
        )}

        {/* Articles Grid */}
        <section className="mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedArticles.map((article) => {
              const articleCategory = blogData.categories.find((c) => c.slug === article.category);
              return (
                <Link
                  key={article.id}
                  href={`/blog/${article.slug}`}
                  className="block group bg-dark-surface border border-hairline-dark hover:border-yt-red/50 transition-all hover:-translate-y-1"
                >
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      {articleCategory && (
                        <Badge className={`text-[10px] ${getCategoryColor(articleCategory.color)}`}>
                          {articleCategory.name}
                        </Badge>
                      )}
                      {article.niche && (
                        <Badge variant="outline" className="text-[10px]">
                          {article.niche}
                        </Badge>
                      )}
                    </div>

                    <h3 className="text-lg font-bold mb-2 group-hover:text-yt-red transition-colors line-clamp-2">
                      {article.title}
                    </h3>

                    <p className="text-dark-ink-secondary text-sm mb-4 line-clamp-2">
                      {article.excerpt}
                    </p>

                    <div className="flex items-center justify-between text-xs text-dark-ink-tertiary">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {article.content.fr.readTime} min
                      </span>
                      <span>{formatDate(article.timestamps.publishedAt)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Pagination */}
        {totalPages > 1 && (
          <section className="flex items-center justify-center gap-2">
            {currentPage > 1 && (
              <Link
                href={`/blog?page=${currentPage - 1}${category ? `&category=${category}` : ""}`}
                className="px-4 py-2 border border-hairline-dark hover:border-yt-red/50 transition-colors"
              >
                Précédent
              </Link>
            )}

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`/blog?page=${p}${category ? `&category=${category}` : ""}`}
                className={`px-4 py-2 transition-colors ${
                  p === currentPage
                    ? "bg-yt-red text-white"
                    : "border border-hairline-dark hover:border-yt-red/50"
                }`}
              >
                {p}
              </Link>
            ))}

            {currentPage < totalPages && (
              <Link
                href={`/blog?page=${currentPage + 1}${category ? `&category=${category}` : ""}`}
                className="px-4 py-2 border border-hairline-dark hover:border-yt-red/50 transition-colors"
              >
                Suivant
              </Link>
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-hairline-dark bg-dark-canvas">
        <div className="max-w-[1400px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="bg-dark-surface-overlay p-1">
              <Play className="w-4 h-4 text-dark-ink-secondary fill-current" />
            </div>
            <span className="font-bold">TrendHunter</span>
          </div>

          <div className="flex gap-8 text-sm text-dark-ink-secondary font-medium">
            <Link href="/pricing" className="hover:text-dark-ink">
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
