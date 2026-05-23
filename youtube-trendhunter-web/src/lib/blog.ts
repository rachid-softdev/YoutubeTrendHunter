import { promises as fs } from "fs";
import path from "path";
import { unstable_cache } from "next/cache";

interface Article {
  id: string;
  slug: string;
  status: string;
  featured: boolean;
  category: string;
  niche: string | null;
  language: string;
  title: string;
  titleEn: string;
  subtitle: string;
  excerpt: string;
  content: {
    fr: {
      sections: ContentSection[];
      tags: string[];
      readTime: number;
      difficulty: string;
    };
    en?: object;
  };
  seo: { metaTitle: string; metaDescription: string; keywords: string[] };
  media: { coverImage: { url: string; alt: string } };
  author: { name: string; avatar: string; bio: string };
  timestamps: { publishedAt: string; updatedAt: string };
  relatedArticles: string[];
}

interface ContentSection {
  type: string;
  heading?: string;
  content?: string;
  variant?: string;
  subsections?: ContentSection[];
  items?: string[];
  text?: string;
  author?: string;
}

interface BlogData {
  meta: { lastUpdated: string; totalArticles: number; version: string };
  categories: Category[];
  articles: Article[];
}

interface Category {
  slug: string;
  name: string;
  description: string;
  color: string;
}

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

// Private function - reads file directly
async function _getBlogData(): Promise<BlogData> {
  try {
    const raw = await fs.readFile(path.join(CONTENT_DIR, "articles.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      meta: { lastUpdated: new Date().toISOString(), totalArticles: 0, version: "1.0" },
      categories: [],
      articles: [],
    };
  }
}

// Cached version - revalidated every hour
const getBlogDataCached = unstable_cache(async () => _getBlogData(), ["blog-data"], {
  revalidate: 3600,
});

export async function getBlogData(): Promise<BlogData> {
  return getBlogDataCached();
}

// Cached articles list
const getArticlesCached = unstable_cache(
  async (options?: { status?: string; category?: string; limit?: number }): Promise<Article[]> => {
    const data = await getBlogDataCached();
    let articles = data.articles;

    if (options?.status) articles = articles.filter((a) => a.status === options.status);
    if (options?.category) articles = articles.filter((a) => a.category === options.category);

    articles.sort(
      (a, b) =>
        new Date(b.timestamps.publishedAt).getTime() - new Date(a.timestamps.publishedAt).getTime(),
    );

    if (options?.limit) articles = articles.slice(0, options.limit);
    return articles;
  },
  ["articles-list"],
  { revalidate: 3600 },
);

export async function getArticles(options?: {
  status?: string;
  category?: string;
  limit?: number;
}): Promise<Article[]> {
  return getArticlesCached(options);
}

// Cached single article
const getArticleCached = unstable_cache(
  async (slug: string): Promise<Article | null> => {
    const data = await getBlogDataCached();
    return data.articles.find((a) => a.slug === slug && a.status === "published") || null;
  },
  ["article-single"],
  { revalidate: 3600 },
);

export async function getArticle(slug: string): Promise<Article | null> {
  return getArticleCached(slug);
}

// Featured article - no cache (used for SSG builds)
export async function getFeaturedArticle(): Promise<Article | null> {
  const data = await _getBlogData();
  const published = data.articles.filter((a) => a.status === "published");
  return published.find((a) => a.featured) || published[0] || null;
}

// Cached categories
const getCategoriesCached = unstable_cache(
  async (): Promise<Category[]> => {
    const data = await getBlogDataCached();
    return data.categories;
  },
  ["blog-categories"],
  { revalidate: 3600 },
);

export async function getCategories(): Promise<Category[]> {
  return getCategoriesCached();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
