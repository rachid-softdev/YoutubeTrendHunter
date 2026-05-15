import { promises as fs } from "fs"
import path from "path"

interface Article {
  id: string
  slug: string
  status: string
  featured: boolean
  category: string
  niche: string | null
  language: string
  title: string
  titleEn: string
  subtitle: string
  excerpt: string
  content: {
    fr: {
      sections: ContentSection[]
      tags: string[]
      readTime: number
      difficulty: string
    }
    en?: object
  }
  seo: { metaTitle: string; metaDescription: string; keywords: string[] }
  media: { coverImage: { url: string; alt: string } }
  author: { name: string; avatar: string; bio: string }
  timestamps: { publishedAt: string; updatedAt: string }
  relatedArticles: string[]
}

interface ContentSection {
  type: string
  heading?: string
  content?: string
  variant?: string
  subsections?: ContentSection[]
  items?: string[]
  text?: string
  author?: string
}

interface BlogData {
  meta: { lastUpdated: string; totalArticles: number; version: string }
  categories: Category[]
  articles: Article[]
}

interface Category {
  slug: string
  name: string
  description: string
  color: string
}

const CONTENT_DIR = path.join(process.cwd(), "content", "blog")

export async function getBlogData(): Promise<BlogData> {
  try {
    const raw = await fs.readFile(path.join(CONTENT_DIR, "articles.json"), "utf-8")
    return JSON.parse(raw)
  } catch {
    return { meta: { lastUpdated: new Date().toISOString(), totalArticles: 0, version: "1.0" }, categories: [], articles: [] }
  }
}

export async function getArticles(options?: { status?: string; category?: string; limit?: number }): Promise<Article[]> {
  const data = await getBlogData()
  let articles = data.articles

  if (options?.status) articles = articles.filter(a => a.status === options.status)
  if (options?.category) articles = articles.filter(a => a.category === options.category)

  articles.sort((a, b) => new Date(b.timestamps.publishedAt).getTime() - new Date(a.timestamps.publishedAt).getTime())

  if (options?.limit) articles = articles.slice(0, options.limit)
  return articles
}

export async function getArticle(slug: string): Promise<Article | null> {
  const data = await getBlogData()
  return data.articles.find(a => a.slug === slug && a.status === "published") || null
}

export async function getFeaturedArticle(): Promise<Article | null> {
  const articles = await getArticles({ status: "published" })
  return articles.find(a => a.featured) || articles[0] || null
}

export async function getCategories(): Promise<Category[]> {
  const data = await getBlogData()
  return data.categories
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}