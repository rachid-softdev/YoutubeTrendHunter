import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle, getArticles } from "@/lib/blog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  Calendar,
  Tag,
  User,
  ChevronRight,
  Lightbulb,
  AlertTriangle,
  Info,
  Quote,
} from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const articles = await getArticles({ status: "published" });
  return articles.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    return {
      title: "Article non trouvé - TrendHunter",
    };
  }

  return {
    title: article.seo.metaTitle,
    description: article.seo.metaDescription,
    keywords: article.seo.keywords,
    openGraph: {
      title: article.seo.metaTitle,
      description: article.seo.metaDescription,
      type: "article",
      locale: "fr_FR",
      publishedTime: article.timestamps.publishedAt,
      authors: [article.author.name],
      tags: article.content.fr.tags,
    },
    alternates: {
      canonical: `https://trendhunter.app/blog/${slug}`,
    },
  };
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getDifficultyVariant(difficulty: string): "default" | "secondary" | "outline" {
  switch (difficulty) {
    case "débutant":
      return "secondary";
    case "intermédiaire":
      return "default";
    case "avancé":
      return "outline";
    default:
      return "default";
  }
}

function Callout({ variant, text }: { variant: string; text: string }) {
  const variants = {
    tip: {
      icon: Lightbulb,
      bg: "bg-yt-red/10",
      border: "border-yt-red/30",
      iconColor: "text-yt-red",
    },
    warning: {
      icon: AlertTriangle,
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      iconColor: "text-amber-500",
    },
    info: {
      icon: Info,
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      iconColor: "text-blue-500",
    },
  };
  const config = variants[variant as keyof typeof variants] || variants.info;
  const Icon = config.icon;
  return (
    <div className={`p-4 ${config.bg} border ${config.border}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
        <p className="text-dark-ink-secondary">{text}</p>
      </div>
    </div>
  );
}

function StatsSection({ items }: { items?: (string | { label?: string; value?: string })[] }) {
  if (!items) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-dark-surface border border-hairline-dark">
      {items.map((item, index) => {
        const label = typeof item === "string" ? item : (item.label ?? "");
        const value = typeof item === "string" ? "" : (item.value ?? "");
        return (
          <div key={index} className="text-center">
            {value && (
              <div className="text-2xl md:text-3xl font-black text-yt-red mb-1">{value}</div>
            )}
            <div className="text-xs text-dark-ink-secondary uppercase tracking-wide">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function QuoteSection({ text, author }: { text: string; author: string }) {
  return (
    <blockquote className="p-6 border-l-4 border-yt-red bg-dark-surface/50">
      <Quote className="w-8 h-8 text-yt-red/30 mb-3" />
      <p className="text-lg text-dark-ink italic mb-3">"{text}"</p>
      <cite className="text-sm text-dark-ink-secondary not-italic">— {author}</cite>
    </blockquote>
  );
}

function renderSection(section: {
  type: string;
  heading?: string;
  content?: string;
  variant?: string;
  text?: string;
  items?: (string | { label?: string; value?: string })[];
  author?: string;
  subsections?: { type?: string; heading?: string; content?: string }[];
}) {
  switch (section.type) {
    case "intro":
      return (
        <p className="text-lg text-dark-ink-secondary leading-relaxed mb-8">{section.content}</p>
      );
    case "h2":
      return (
        <section className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-dark-ink">{section.heading}</h2>
          {section.content && <p className="text-dark-ink-secondary mb-4">{section.content}</p>}
          {section.subsections?.map((sub, i) => (
            <div key={i} className="mb-6">
              <h3 className="text-xl font-semibold mb-2 text-dark-ink">{sub.heading}</h3>
              <p className="text-dark-ink-secondary">{sub.content}</p>
            </div>
          ))}
          {section.items && (
            <ul className="space-y-2 list-none">
              {section.items.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-dark-ink-secondary">
                  <ChevronRight className="w-4 h-4 text-yt-red flex-shrink-0 mt-1" />
                  <span>{String(item)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    case "h3":
      return (
        <div className="mb-6 pl-4 border-l-2 border-yt-red/30">
          <h3 className="text-lg font-semibold mb-2 text-dark-ink">{section.heading}</h3>
          <p className="text-dark-ink-secondary">{section.content}</p>
        </div>
      );
    case "callout":
      return (
        <div className="mb-8">
          <Callout variant={section.variant || "info"} text={section.text || ""} />
        </div>
      );
    case "stats":
      return (
        <div className="mb-8">
          <StatsSection items={section.items} />
        </div>
      );
    case "items":
      return (
        <ul className="space-y-3 list-none mb-8">
          {section.items?.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-dark-ink-secondary">
              <div className="w-2 h-2 bg-yt-red flex-shrink-0 mt-2" />
              <span>{String(item)}</span>
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <div className="mb-8">
          <QuoteSection text={section.text || ""} author={section.author || ""} />
        </div>
      );
    case "conclusion":
      return (
        <section className="mt-12 p-6 bg-dark-surface border border-yt-red/20">
          <h2 className="text-xl font-bold mb-3 text-yt-red">{section.heading}</h2>
          <p className="text-dark-ink-secondary">{section.content}</p>
        </section>
      );
    default:
      return null;
  }
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    notFound();
  }

  const allArticles = await getArticles({ status: "published" });
  const relatedArticles =
    article.relatedArticles?.map((id) => allArticles.find((a) => a.id === id)).filter(Boolean) ||
    [];
  const content = article.content.fr;

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink selection:bg-yt-red/30">
      <main className="max-w-[1400px] mx-auto px-4 py-12">
        <nav className="mb-8">
          <div className="flex items-center gap-2 text-sm">
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
            <span className="text-dark-ink truncate max-w-[200px]">{article.title}</span>
          </div>
        </nav>

        <article className="mb-12">
          <header className="mb-8">
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline" className="uppercase tracking-wide">
                {article.category}
              </Badge>
              {content.difficulty && (
                <Badge variant={getDifficultyVariant(content.difficulty)}>
                  {content.difficulty}
                </Badge>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black mb-4 leading-tight">
              {article.title}
            </h1>
            {article.subtitle && (
              <p className="text-xl text-dark-ink-secondary mb-6 max-w-3xl">{article.subtitle}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-dark-ink-secondary">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>{article.author.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(article.timestamps.publishedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{content.readTime} min de lecture</span>
              </div>
            </div>
            {content.tags && content.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                <Tag className="w-4 h-4 text-dark-ink-tertiary" />
                {content.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </header>
          <Separator className="mb-8" />
          <div className="prose prose-invert max-w-none">
            {content.sections.map((section, index) => (
              <div key={index}>{renderSection(section)}</div>
            ))}
          </div>
        </article>

        <Separator className="mb-12" />

        {relatedArticles.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Articles similaires</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedArticles.map(
                (related) =>
                  related && (
                    <Link key={related.id} href={`/blog/${related.slug}`}>
                      <Card className="h-full hover:border-yt-red/30 transition-colors group cursor-pointer">
                        <CardContent className="p-6">
                          <div className="flex flex-wrap gap-2 mb-3">
                            <Badge variant="outline" className="text-[10px]">
                              {related.category}
                            </Badge>
                          </div>
                          <h3 className="font-bold text-lg mb-2 group-hover:text-yt-red transition-colors line-clamp-2">
                            {related.title}
                          </h3>
                          {related.excerpt && (
                            <p className="text-sm text-dark-ink-secondary line-clamp-2">
                              {related.excerpt}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-4 text-xs text-dark-ink-tertiary">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {related.content.fr.readTime} min
                            </span>
                            <span>{formatDate(related.timestamps.publishedAt)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ),
              )}
            </div>
          </section>
        )}

        <div className="mt-12 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-dark-ink-secondary hover:text-dark-ink transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" /> Retour au blog
          </Link>
        </div>
      </main>
    </div>
  );
}
