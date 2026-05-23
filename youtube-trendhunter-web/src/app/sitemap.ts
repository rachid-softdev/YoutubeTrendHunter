import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.NEXTAUTH_URL || "https://trendhunter.app";

// Static pages
const staticPages = [
  { url: "/", priority: 1.0, changefreq: "daily" as const },
  { url: "/pricing", priority: 0.9, changefreq: "weekly" as const },
  { url: "/login", priority: 0.8, changefreq: "weekly" as const },
  { url: "/privacy", priority: 0.7, changefreq: "weekly" as const },
  { url: "/terms", priority: 0.7, changefreq: "weekly" as const },
  { url: "/niches", priority: 0.9, changefreq: "daily" as const },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitemapEntries: MetadataRoute.Sitemap = staticPages.map((page) => ({
    url: `${BASE_URL}${page.url}`,
    lastModified: new Date(),
    changeFrequency: page.changefreq,
    priority: page.priority,
  }));

  // Dynamic niche pages from DB
  try {
    const niches = await prisma.niche.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    });

    for (const niche of niches) {
      sitemapEntries.push({
        url: `${BASE_URL}/niches/${niche.slug}`,
        lastModified: niche.updatedAt || new Date(),
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch (error) {
    console.error("Error fetching niches for sitemap:", error);
  }

  // Blog articles from JSON (if exists)
  try {
    const fs = await import("fs");
    const path = await import("path");
    const contentDir = path.join(process.cwd(), "content", "blog");
    const articlesPath = path.join(contentDir, "articles.json");

    if (fs.existsSync(articlesPath)) {
      const raw = fs.readFileSync(articlesPath, "utf-8");
      const data = JSON.parse(raw);
      const blogArticles = data.articles || [];

      for (const article of blogArticles) {
        if (article.status === "published") {
          sitemapEntries.push({
            url: `${BASE_URL}/blog/${article.slug}`,
            lastModified: new Date(article.timestamps?.publishedAt || Date.now()),
            changeFrequency: "daily" as const,
            priority: 0.7,
          });
        }
      }
    }
  } catch (error) {
    // Blog content not available, skip
    console.log("Blog articles not available, skipping from sitemap");
  }

  return sitemapEntries;
}
