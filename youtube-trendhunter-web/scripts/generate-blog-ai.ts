#!/usr/bin/env npx tsx
/**
 * AI Blog Article Generator
 *
 * Usage:
 *   npx tsx scripts/generate-blog-ai.ts
 *
 * Environment variables:
 *   - ANTHROPIC_API_KEY: Required for AI generation
 *   - ARTICLES_PER_RUN: Number of articles to generate (default: 3, max: 5)
 *
 * This script:
 *   1. Reads pending topics from content/blog/topics.json
 *   2. Uses Anthropic/Claude to generate full blog articles in French
 *   3. Writes articles to content/blog/articles.json
 *   4. Marks topics as generated in topics.json
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");
const TOPICS_FILE = path.join(CONTENT_DIR, "topics.json");
const ARTICLES_FILE = path.join(CONTENT_DIR, "articles.json");

interface Topic {
  slug: string;
  category: string;
  niche: string;
  language: string;
  priority: number;
  title: string;
  titleEn: string;
  subtitle: string;
  targetKeywords: string[];
  targetKeywordsEn: string[];
  outline: {
    sections: Array<{
      type: string;
      heading?: string;
      focus: string;
    }>;
  };
  lastGeneratedAt: string | null;
  generated: boolean;
}

interface TopicFile {
  version: string;
  lastUpdated: string;
  totalTopics: number;
  topics: Topic[];
}

interface Article {
  id: string;
  slug: string;
  title: string;
  titleEn: string;
  subtitle: string;
  excerpt: string;
  content: {
    intro: string;
    h2: string;
    h3: string;
    callout: string;
    stats: string;
    list: string;
    quote: string;
    conclusion: string;
  };
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
  tags: string[];
  category: string;
  niche: string;
  readTime: number;
  difficulty: string;
  publishedAt: string;
  createdAt: string;
}

interface ArticlesFile {
  meta: {
    lastUpdated: string;
    totalArticles: number;
    version: string;
  };
  categories: Array<{
    slug: string;
    name: string;
    description: string;
    color: string;
  }>;
  articles: Article[];
}

interface Category {
  slug: string;
  name: string;
  description: string;
  color: string;
}

const CATEGORIES: Category[] = [
  {
    slug: "tendances",
    name: "Tendances",
    description: "Analyses des tendances YouTube actuelles",
    color: "#FF0000",
  },
  {
    slug: "guides",
    name: "Guides",
    description: "Tutoriels et guides pratiques",
    color: "#065FD4",
  },
  {
    slug: "comparatifs",
    name: "Comparatifs",
    description: "Comparatifs d'outils et stratégies",
    color: "#FFD600",
  },
  {
    slug: "analyses",
    name: "Analyses",
    description: "Analyses approfondies du marché",
    color: "#2BA640",
  },
  {
    slug: "actualites",
    name: "Actualités",
    description: "Nouveautés et mises à jour",
    color: "#6A0DAD",
  },
];

function log(message: string, level: "info" | "success" | "error" | "warn" = "info"): void {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: "ℹ️",
    success: "✅",
    error: "❌",
    warn: "⚠️",
  }[level];
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function loadJsonFile<T>(filePath: string): T {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    log(`Failed to load ${filePath}: ${error}`, "error");
    throw error;
  }
}

function saveJsonFile(filePath: string, data: unknown): void {
  try {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (error) {
    log(`Failed to save ${filePath}: ${error}`, "error");
    throw error;
  }
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateArticleId(): string {
  return `art_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function generateWithRetry(
  anthropic: Anthropic,
  topic: Topic,
  maxRetries: number = 3,
): Promise<Article | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`Generating article for: "${topic.title}" (attempt ${attempt}/${maxRetries})`, "info");

      const prompt = `Tu es un expert en création de contenu pour un blog sur les tendances YouTube et la création de vidéos.

Génère un article de blog complet en français basé sur le sujet suivant:

Sujet: ${topic.title}
Sous-titre: ${topic.subtitle}
Catégorie: ${topic.category}
Niche: ${topic.niche}
Mots-clés ciblés: ${topic.targetKeywords.join(", ")}

Structure attendue (JSON):
{
  "title": "${topic.title}",
  "titleEn": "${topic.titleEn}",
  "subtitle": "${topic.subtitle}",
  "excerpt": "Phrase d'accroche de 150-200 caractères",
  "content": {
    "intro": "Introduction de 300-400 mots qui pose le contexte et l'enjeu",
    "h2": "Section principale H2 avec 400-600 mots",
    "h3": "Sous-section H3 avec 200-300 mots",
    "callout": "Encadré alert/astuce de 100-150 mots",
    "stats": "Statistiques et données clés en 150-200 mots",
    "list": "Liste structurée de 5-7 points en 300-400 mots",
    "quote": "Citation inspirante avec contexte de 100-150 mots",
    "conclusion": "Conclusion et call-to-action de 200-250 mots"
  },
  "seo": {
    "title": "Titre SEO优化 (max 60 caractères)",
    "description": "Meta description (150-160 caractères)",
    "keywords": ["mot-clé1", "mot-clé2", "mot-clé3"]
  },
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "readTime": 8,
  "difficulty": "intermediate"
}

Règles importantes:
- Le contenu doit être en français, professionnel et engageant
- Utilise un ton conversationnel mais expert
- Incorpore naturally les mots-clés SEO
- Sois concret avec des exemples et des données
- Le format de sortie doit être STRICTEMENT du JSON valide
- Ne pas inclure de markdown ou de texte supplémentaire

Titre de l'article: ${topic.title}`;

      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        temperature: 0.7,
        system:
          "Tu es un expert en création de contenu blog. Tu génères uniquement du JSON valide, sans texte additionnel.",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const textContent = response.content[0];
      if (!textContent || textContent.type !== "text") {
        throw new Error("Invalid response from Anthropic");
      }

      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const article: Article = {
        id: generateArticleId(),
        slug: topic.slug,
        title: parsed.title || topic.title,
        titleEn: parsed.titleEn || topic.titleEn,
        subtitle: parsed.subtitle || topic.subtitle,
        excerpt: parsed.excerpt || "",
        content: {
          intro: parsed.content?.intro || "",
          h2: parsed.content?.h2 || "",
          h3: parsed.content?.h3 || "",
          callout: parsed.content?.callout || "",
          stats: parsed.content?.stats || "",
          list: parsed.content?.list || "",
          quote: parsed.content?.quote || "",
          conclusion: parsed.content?.conclusion || "",
        },
        seo: parsed.seo || { title: "", description: "", keywords: [] },
        tags: parsed.tags || [],
        category: topic.category,
        niche: topic.niche,
        readTime: parsed.readTime || 8,
        difficulty: parsed.difficulty || "intermediate",
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      log(`Successfully generated: ${article.title}`, "success");
      return article;
    } catch (error) {
      log(`Attempt ${attempt} failed: ${error}`, "warn");
      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        log(`Retrying in ${delay}ms...`, "info");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  log(`Failed to generate article for "${topic.title}" after ${maxRetries} attempts`, "error");
  return null;
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const articlesPerRun = Math.min(parseInt(process.env.ARTICLES_PER_RUN || "3", 10), 5);

  if (!apiKey) {
    log("ANTHROPIC_API_KEY environment variable is required", "error");
    console.log("\nUsage:");
    console.log("  export ANTHROPIC_API_KEY=sk-ant-...");
    console.log("  npx tsx scripts/generate-blog-ai.ts");
    process.exit(1);
  }

  log("Starting AI Blog Generator", "info");
  log(`Articles per run: ${articlesPerRun}`, "info");

  // Ensure content directory exists
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
    log(`Created content directory: ${CONTENT_DIR}`, "info");
  }

  // Load topics
  let topicsData: TopicFile;
  try {
    topicsData = loadJsonFile<TopicFile>(TOPICS_FILE);
  } catch {
    log("topics.json not found. Creating empty structure...", "warn");
    topicsData = {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      totalTopics: 0,
      topics: [],
    };
    saveJsonFile(TOPICS_FILE, topicsData);
  }

  // Find pending topics (not generated, sorted by priority)
  const pendingTopics = topicsData.topics
    .filter((t) => !t.generated)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, articlesPerRun);

  if (pendingTopics.length === 0) {
    log("No pending topics to generate. All topics have been processed!", "success");
    return;
  }

  log(`Found ${pendingTopics.length} pending topics to process`, "info");

  // Load existing articles
  let articlesData: ArticlesFile;
  try {
    articlesData = loadJsonFile<ArticlesFile>(ARTICLES_FILE);
  } catch {
    log("articles.json not found. Creating new structure...", "warn");
    articlesData = {
      meta: {
        lastUpdated: new Date().toISOString(),
        totalArticles: 0,
        version: "1.0",
      },
      categories: CATEGORIES,
      articles: [],
    };
  }

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey,
  });

  // Generate articles
  const generatedArticles: Article[] = [];
  const failedTopics: string[] = [];

  for (const topic of pendingTopics) {
    const article = await generateWithRetry(anthropic, topic);
    if (article) {
      generatedArticles.push(article);
      // Mark topic as generated
      const topicIndex = topicsData.topics.findIndex((t) => t.slug === topic.slug);
      if (topicIndex !== -1) {
        topicsData.topics[topicIndex].generated = true;
        topicsData.topics[topicIndex].lastGeneratedAt = new Date().toISOString();
      }
    } else {
      failedTopics.push(topic.title);
    }

    // Rate limiting - be nice to the API
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Update articles file
  articlesData.articles.push(...generatedArticles);
  articlesData.meta.lastUpdated = new Date().toISOString();
  articlesData.meta.totalArticles = articlesData.articles.length;
  saveJsonFile(ARTICLES_FILE, articlesData);

  // Update topics file
  topicsData.lastUpdated = new Date().toISOString();
  saveJsonFile(TOPICS_FILE, topicsData);

  // Summary
  log("\n=== Generation Summary ===", "info");
  log(`Articles generated: ${generatedArticles.length}`, "success");
  if (failedTopics.length > 0) {
    log(`Failed topics: ${failedTopics.join(", ")}`, "warn");
  }
  log(`Total articles in database: ${articlesData.meta.totalArticles}`, "info");
  log("========================\n", "info");
}

main().catch((error) => {
  log(`Fatal error: ${error}`, "error");
  process.exit(1);
});
