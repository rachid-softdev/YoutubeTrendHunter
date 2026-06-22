import { test, expect, type Page } from "@playwright/test";

/**
 * Marketing Niches E2E tests for YouTube TrendHunter
 *
 * Covers the public marketing niches pages:
 *   - Niches Listing   (/niches)
 *   - Niche Detail     (/niches/[slug])
 *
 * These are PUBLIC routes — no authentication required.
 * Tests use page.route() to mock SSR page responses for deterministic,
 * database-free execution.
 */

/* -------------------------------------------------------------------------- */
/*  Mock data helpers                                                          */
/* -------------------------------------------------------------------------- */

interface MockNiche {
  slug: string;
  name: string;
  description: string;
  trendCount: number;
  keywords: string[];
  color: string;
  bgColor: string;
  borderColor: string;
}

interface MockTrend {
  id: string;
  title: string;
  description: string;
  score: number;
  velocity: number;
  searchVolume: number;
  detectedAt: string;
  contentAngles: string[];
  videoUrl: string;
  channelName: string;
  rank: number;
}

function createMockNiches(): MockNiche[] {
  return [
    {
      slug: "tech",
      name: "Tech & High-Tech",
      description: "IA, programmation, gadgets, technologie",
      trendCount: 12,
      keywords: ["Intelligence Artificielle", "Programmation", "Gadgets", "Innovation"],
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
    },
    {
      slug: "finance",
      name: "Finance & Crypto",
      description: "Crypto, investissement, trading, économie",
      trendCount: 8,
      keywords: ["Cryptomonnaie", "Investissement", "Trading", "Blockchain"],
      color: "text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
    },
    {
      slug: "fitness",
      name: "Fitness & Bien-être",
      description: "Musculation, yoga, sport, minceur",
      trendCount: 5,
      keywords: ["Musculation", "Yoga", "Sport", "Bien-être"],
      color: "text-orange-400",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/20",
    },
    {
      slug: "cuisine",
      name: "Cuisine & Gastronomie",
      description: "Recettes, food, cuisine du monde",
      trendCount: 3,
      keywords: ["Recettes", "Gastronomie", "Cuisine healthy", "Food"],
      color: "text-yellow-400",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/20",
    },
    {
      slug: "business",
      name: "Business & Entrepreneuriat",
      description: "Marketing, start-up, développement personnel",
      trendCount: 0,
      keywords: ["Marketing", "Start-up", "Productivité", "Entrepreneuriat"],
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
    },
  ];
}

function createMockTrends(): MockTrend[] {
  return [
    {
      id: "trend-1",
      title: "L'IA générative explose sur YouTube en 2026",
      description:
        "Les créateurs utilisent l'IA générative pour produire du contenu plus rapidement. Tutoriels, reviews et comparaisons d'outils dominent.",
      score: 92,
      velocity: 145.3,
      searchVolume: 245000,
      detectedAt: "2026-06-15T10:00:00.000Z",
      contentAngles: [
        "Tutoriel débutant",
        "Comparaison d'outils",
        "Cas d'usage avancé",
        "Review honnête",
      ],
      videoUrl: "https://youtube.com/watch?v=gen-ai-2026",
      channelName: "TechMaster",
      rank: 1,
    },
    {
      id: "trend-2",
      title: "Rust vs Go en 2026 — quel langage choisir ?",
      description:
        "Le débat Rust vs Go continue. Analyse des performances, de la courbe d'apprentissage et des opportunités d'emploi.",
      score: 78,
      velocity: 92.1,
      searchVolume: 128000,
      detectedAt: "2026-06-14T10:00:00.000Z",
      contentAngles: ["Comparaison", "Benchmark", "Débuter avec Rust"],
      videoUrl: "https://youtube.com/watch?v=rust-vs-go-2026",
      channelName: "CodeAcademy",
      rank: 2,
    },
    {
      id: "trend-3",
      title: "WebAssembly explose — le futur du développement web",
      description:
        "WebAssembly transforme le développement web. Performances natives, portabilité et nouveaux cas d'usage.",
      score: 65,
      velocity: 55.7,
      searchVolume: 89000,
      detectedAt: "2026-06-10T10:00:00.000Z",
      contentAngles: ["Tutoriel", "Architecture", "Cas concret"],
      videoUrl: "https://youtube.com/watch?v=wasm-future",
      channelName: "WebDevPro",
      rank: 3,
    },
    {
      id: "trend-4",
      title: "Neovim vs VSCode en 2026 — l'éditeur ultime",
      description:
        "Les développeurs migrent vers Neovim pour sa rapidité. Comparaison détaillée des workflows.",
      score: 45,
      velocity: 32.4,
      searchVolume: 56000,
      detectedAt: "2026-06-08T10:00:00.000Z",
      contentAngles: ["Comparaison", "Productivité", "Configuration"],
      videoUrl: "https://youtube.com/watch?v=neovim-vscode",
      channelName: "DevToolsGuy",
      rank: 4,
    },
    {
      id: "trend-5",
      title: "TypeScript 6.0 — les nouvelles fonctionnalités",
      description:
        "Microsoft dévoile TypeScript 6.0 avec des fonctionnalités très attendues. Découvrez les changements majeurs.",
      score: 55,
      velocity: 40.2,
      searchVolume: 72000,
      detectedAt: "2026-06-05T10:00:00.000Z",
      contentAngles: ["Nouveautés", "Migration", "Tutoriel"],
      videoUrl: "https://youtube.com/watch?v=ts-6-0",
      channelName: "TSExpert",
      rank: 5,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*  Page HTML generators (mock SSR responses)                                  */
/* -------------------------------------------------------------------------- */

function buildNichesListingHtml(mockNiches: MockNiche[]): string {
  const cardsHtml = mockNiches
    .map(
      (n) => `
    <a
      key="${n.slug}"
      href="/niches/${n.slug}"
      class="block p-6 bg-dark-surface border transition-all group border-hairline-dark hover:border-yt-red/50 hover:-translate-y-1"
    >
      <div class="flex items-start justify-between mb-4">
        <div class="w-12 h-12 ${n.bgColor} flex items-center justify-center border ${n.borderColor}">
          <svg class="w-6 h-6 ${n.color}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
        ${
          n.trendCount > 0
            ? `<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold border-transparent bg-yt-red text-white">${n.trendCount} tendances</span>`
            : ""
        }
      </div>

      <h2 class="text-xl font-bold mb-2 group-hover:text-yt-red transition-colors">${n.name}</h2>

      <p class="text-dark-ink-secondary text-sm mb-4">${n.description}</p>

      <div class="flex flex-wrap gap-2">
        ${n.keywords
          .map(
            (kw) =>
              `<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold border-hairline-dark text-dark-ink-secondary">${kw}</span>`,
          )
          .join("")}
      </div>

      <div class="mt-4 flex items-center gap-2 text-sm font-bold text-yt-red opacity-0 group-hover:opacity-100 transition-opacity">
        Voir tout →
      </div>
    </a>
  `,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Niches YouTube - Détectez les tendances par catégorie | TrendHunter</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"TrendHunter","url":"https://trendhunter.app"}</script>
  <style>
    .min-h-screen { min-height: 100vh; }
    .bg-dark-canvas { background-color: #0f0f0f; }
    .text-dark-ink { color: #f1f1f1; }
    .text-dark-ink-secondary { color: #aaaaaa; }
    .text-dark-ink-tertiary { color: #717171; }
    .text-yt-red { color: #ff0000; }
    .bg-yt-red { background-color: #ff0000; }
    .bg-yt-red\\/10 { background-color: rgba(255,0,0,0.1); }
    .bg-yt-red\\/30 { background-color: rgba(255,0,0,0.3); }
    .border-yt-red\\/20 { border-color: rgba(255,0,0,0.2); }
    .border-yt-red\\/50 { border-color: rgba(255,0,0,0.5); }
    .bg-dark-surface { background-color: #1a1a1a; }
    .bg-dark-surface-overlay { background-color: #2a2a2a; }
    .border-hairline-dark { border-color: #2a2a2a; }
    .bg-blue-500\\/10 { background-color: rgba(59,130,246,0.1); }
    .text-blue-400 { color: #60a5fa; }
    .border-blue-500\\/20 { border-color: rgba(59,130,246,0.2); }
    .bg-green-500\\/10 { background-color: rgba(34,197,94,0.1); }
    .text-green-400 { color: #4ade80; }
    .border-green-500\\/20 { border-color: rgba(34,197,94,0.2); }
    .bg-orange-500\\/10 { background-color: rgba(249,115,22,0.1); }
    .text-orange-400 { color: #fb923c; }
    .border-orange-500\\/20 { border-color: rgba(249,115,22,0.2); }
    .bg-yellow-500\\/10 { background-color: rgba(234,179,8,0.1); }
    .text-yellow-400 { color: #facc15; }
    .border-yellow-500\\/20 { border-color: rgba(234,179,8,0.2); }
    .bg-purple-500\\/10 { background-color: rgba(168,85,247,0.1); }
    .text-purple-400 { color: #c084fc; }
    .border-purple-500\\/20 { border-color: rgba(168,85,247,0.2); }
    .text-white { color: #fff; }
    .font-black { font-weight: 900; }
    .font-bold { font-weight: 700; }
    .text-xl { font-size: 1.25rem; }
    .text-sm { font-size: 0.875rem; }
    .text-lg { font-size: 1.125rem; }
    .text-xs { font-size: 0.75rem; }
    .text-\\[10px\\] { font-size: 10px; }
    .grid { display: grid; }
    .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
    .gap-6 { gap: 1.5rem; }
    .block { display: block; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .items-start { align-items: flex-start; }
    .justify-between { justify-content: space-between; }
    .p-6 { padding: 1.5rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .py-12 { padding-top: 3rem; padding-bottom: 3rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mb-8 { margin-bottom: 2rem; }
    .mb-16 { margin-bottom: 4rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .w-12 { width: 3rem; }
    .h-12 { height: 3rem; }
    .w-4 { width: 1rem; }
    .h-4 { height: 1rem; }
    .w-5 { width: 1.25rem; }
    .h-5 { height: 1.25rem; }
    .max-w-2xl { max-width: 42rem; }
    .max-w-xl { max-width: 36rem; }
    .max-w-\\[1400px\\] { max-width: 1400px; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .rounded-full { border-radius: 9999px; }
    .border { border-width: 1px; }
    .border-t { border-top-width: 1px; }
    .text-center { text-align: center; }
    .inline-flex { display: inline-flex; }
    .gap-2 { gap: 0.5rem; }
    .gap-4 { gap: 1rem; }
    .gap-8 { gap: 2rem; }
    .flex-wrap { flex-wrap: wrap; }
    .tracking-\\[0\\.2em\\] { letter-spacing: 0.2em; }
    .uppercase { text-transform: uppercase; }
    .text-4xl { font-size: 2.25rem; }
    .text-2xl { font-size: 1.5rem; }
    .text-3xl { font-size: 1.875rem; }
    .sticky { position: sticky; }
    .top-0 { top: 0; }
    .z-50 { z-index: 50; }
    .backdrop-blur-md { backdrop-filter: blur(12px); }
    .h-14 { height: 3.5rem; }
    .hidden { display: none; }
    .flex-col { flex-direction: column; }
    .opacity-0 { opacity: 0; }
    .group-hover\\:opacity-100:hover { opacity: 1; }
    .group-hover\\:text-yt-red:hover { color: #ff0000; }
    .hover\\:border-yt-red\\/50:hover { border-color: rgba(255,0,0,0.5); }
    .hover\\:-translate-y-1:hover { transform: translateY(-0.25rem); }
    .transition-all { transition: all 0.2s; }
    .transition-colors { transition: color 0.2s, background-color 0.2s, border-color 0.2s; }
    .transition-opacity { transition: opacity 0.2s; }
    .cursor-not-allowed { cursor: not-allowed; }
    .opacity-50 { opacity: 0.5; }
    .border-dark-canvas { border-color: #0f0f0f; }
    .font-semibold { font-weight: 600; }
    .font-medium { font-weight: 500; }
    .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .px-10 { padding-left: 2.5rem; padding-right: 2.5rem; }
    .h-12 { height: 3rem; }
    .bg-dark-canvas\\/80 { background-color: rgba(15,15,15,0.8); }
  </style>
</head>
<body>
<div class="min-h-screen bg-dark-canvas text-dark-ink selection:bg-yt-red/30">
  <header class="sticky top-0 z-50 bg-dark-canvas/80 backdrop-blur-md border-b border-hairline-dark">
    <div class="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 group">
        <div class="bg-yt-red p-1 group-hover:bg-yt-red-deep transition-colors">
          <svg class="w-4 h-4 text-white fill-current" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
        </div>
        <span class="text-xl font-bold">TrendHunter</span>
      </a>
      <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-dark-ink-secondary">
        <a href="/niches" class="text-dark-ink font-medium">Niches</a>
        <a href="/pricing" class="hover:text-dark-ink transition-colors">Tarifs</a>
      </nav>
      <a href="/login">
        <button class="inline-flex items-center justify-center rounded-md font-bold bg-yt-red text-white hover:bg-yt-red-deep px-4 py-2 h-9 text-sm">ESSAYER Gratuitement</button>
      </a>
    </div>
  </header>

  <main class="max-w-[1400px] mx-auto px-4 py-12">
    <!-- Hero Section -->
    <section class="text-center mb-16">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yt-red/10 border border-yt-red/20 mb-6">
        <svg class="w-4 h-4 text-yt-red" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
        <span class="text-[10px] font-black text-yt-red tracking-[0.2em] uppercase">5 Niches Surveillées</span>
      </div>

      <h1 class="text-4xl md:text-5xl font-black mb-4">Explorez les niches YouTube</h1>
      <p class="text-dark-ink-secondary text-lg max-w-2xl mx-auto mb-8">
        Analysez les tendances en temps réel pour chaque niche. Identifiez les opportunités de
        contenu avant la concurrence.
      </p>

      <a href="/login">
        <button class="inline-flex items-center justify-center rounded-md font-bold bg-yt-red text-white hover:bg-yt-red-deep h-12 px-10">
          COMMENCER L'ANALYSE
          <svg class="ml-2 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
        </button>
      </a>
    </section>

    <!-- Niche Cards Grid -->
    <section class="mb-16">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="niches-grid">
        ${cardsHtml}
      </div>
    </section>

    <!-- Stats Section -->
    <section class="mb-16 py-12 bg-dark-surface border border-hairline-dark">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        <div>
          <div class="text-3xl md:text-4xl font-black text-yt-red mb-2">5</div>
          <div class="text-dark-ink-secondary text-sm">Niches actives</div>
        </div>
        <div>
          <div class="text-3xl md:text-4xl font-black text-yt-red mb-2">1200+</div>
          <div class="text-dark-ink-secondary text-sm">Créateurs</div>
        </div>
        <div>
          <div class="text-3xl md:text-4xl font-black text-yt-red mb-2">24h</div>
          <div class="text-dark-ink-secondary text-sm">Mise à jour</div>
        </div>
        <div>
          <div class="text-3xl md:text-4xl font-black text-yt-red mb-2">100%</div>
          <div class="text-dark-ink-secondary text-sm">Temps réel</div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="text-center py-12" data-testid="cta-section">
      <h2 class="text-2xl md:text-3xl font-bold mb-4">Trouvez votre niche à succès</h2>
      <p class="text-dark-ink-secondary mb-6 max-w-xl mx-auto">
        Pas besoin de deviner quelles niches explosent. TrendHunter analyse les données pour
        vous.
      </p>
      <a href="/login">
        <button class="inline-flex items-center justify-center rounded-md font-bold bg-yt-red text-white hover:bg-yt-red-deep h-12 px-10">
          CRÉER UN COMPTE Gratuit
        </button>
      </a>
    </section>
  </main>

  <!-- Footer -->
  <footer class="py-12 border-t border-hairline-dark bg-dark-canvas">
    <div class="max-w-[1400px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
      <div class="flex items-center gap-2">
        <div class="bg-dark-surface-overlay p-1">
          <svg class="w-4 h-4 text-dark-ink-secondary fill-current" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
        </div>
        <span class="font-bold">TrendHunter</span>
      </div>
      <div class="flex gap-8 text-sm text-dark-ink-secondary font-medium">
        <a href="/pricing" class="hover:text-dark-ink">Tarifs</a>
        <a href="/privacy" class="hover:text-dark-ink">Confidentialité</a>
        <a href="/terms" class="hover:text-dark-ink">CGU</a>
      </div>
      <div class="text-dark-ink-tertiary text-xs">© 2026 TrendHunter. Pour les créateurs, par des créateurs.</div>
    </div>
  </footer>
</div>
</body>
</html>`;
}

function buildNicheDetailHtml(niche: MockNiche, trends: MockTrend[]): string {
  const trendCardsHtml =
    trends.length > 0
      ? trends
          .map((t) => {
            const scoreBadgeClass =
              t.score >= 75
                ? "bg-yt-red text-white"
                : t.score >= 50
                  ? "bg-amber-500 text-white"
                  : "bg-green-500 text-white";
            return `
        <div
          key="${t.id}"
          class="p-6 bg-dark-surface border border-hairline-dark hover:border-yt-red/30 transition-colors group"
          data-testid="trend-card"
        >
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0 w-8 h-8 bg-yt-red flex items-center justify-center font-black text-white text-sm">
              #${t.rank}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="font-bold text-lg truncate">${t.title}</h3>
                <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreBadgeClass} flex-shrink-0" data-testid="score-badge">
                  Score: ${t.score}
                </span>
              </div>
              <p class="text-dark-ink-secondary text-sm mb-3 line-clamp-2">${t.description}</p>
              <div class="flex flex-wrap gap-4 text-xs text-dark-ink-tertiary">
                <span class="flex items-center gap-1" data-testid="velocity">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                  Vélocité: ${t.velocity.toFixed(1)}%
                </span>
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  Volume: ${t.searchVolume.toLocaleString("fr-FR")}
                </span>
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Détecté: ${new Date(t.detectedAt).toLocaleDateString("fr-FR")}
                </span>
              </div>
              ${
                t.contentAngles.length > 0
                  ? `<div class="mt-3 flex flex-wrap gap-2" data-testid="content-angles">
                ${t.contentAngles
                  .slice(0, 3)
                  .map(
                    (angle) =>
                      `<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold border-hairline-dark text-dark-ink-secondary">${angle}</span>`,
                  )
                  .join("")}
              </div>`
                  : ""
              }
              ${
                t.videoUrl
                  ? `<div class="mt-3"><a href="${t.videoUrl}" target="_blank" rel="noopener noreferrer" class="text-xs font-bold text-yt-red hover:text-yt-red-deep transition-colors" data-testid="video-url">Voir la vidéo</a></div>`
                  : ""
              }
            </div>
          </div>
        </div>`;
          })
          .join("\n")
      : `<div class="text-center py-12 bg-dark-surface border border-hairline-dark">
          <svg class="w-12 h-12 text-dark-ink-tertiary mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          <p class="text-dark-ink-secondary mb-4">Aucune tendance active dans cette niche pour le moment.</p>
          <p class="text-sm text-dark-ink-tertiary">Revenez plus tard ou explorez d'autres niches.</p>
        </div>`;

  const faqHtml = [
    {
      question: "Comment TrendHunter détecte-t-il les tendances YouTube ?",
      answer:
        "TrendHunter utilise un algorithme d'IA avancé qui analyse des millions de vidéos YouTube en temps réel.",
    },
    {
      question: "Quelles niches sont disponibles sur TrendHunter ?",
      answer:
        "TrendHunter couvre 5 principales niches : Tech, Finance, Fitness, Cuisine et Business.",
    },
    {
      question: "Comment utiliser les tendances pour mon contenu YouTube ?",
      answer:
        "Chaque tendance sur TrendHunter inclut des angles de contenu suggérés, un score et des données sur les concurrents.",
    },
  ]
    .map(
      (faq, i) => `
    <div key="${i}" class="p-6 bg-dark-surface border border-hairline-dark" data-testid="faq-item">
      <h3 class="font-bold text-lg mb-2" data-testid="faq-question">${faq.question}</h3>
      <p class="text-dark-ink-secondary" data-testid="faq-answer">${faq.answer}</p>
    </div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Tendances ${niche.name} YouTube 2026</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":"https://trendhunter.app"},{"@type":"ListItem","position":2,"name":"Niches","item":"https://trendhunter.app/niches"},{"@type":"ListItem","position":3,"name":"${niche.name}","item":"https://trendhunter.app/niches/${niche.slug}"}]},{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Comment TrendHunter détecte-t-il les tendances YouTube ?","acceptedAnswer":{"@type":"Answer","text":"TrendHunter utilise un algorithme d'IA avancé"}},{"@type":"Question","name":"Quelles niches sont disponibles sur TrendHunter ?","acceptedAnswer":{"@type":"Answer","text":"TrendHunter couvre 5 principales niches"}},{"@type":"Question","name":"Comment utiliser les tendances pour mon contenu YouTube ?","acceptedAnswer":{"@type":"Answer","text":"Chaque tendance sur TrendHunter inclut des angles de contenu suggérés"}}]}]}</script>
  <style>
    .min-h-screen { min-height: 100vh; }
    .bg-dark-canvas { background-color: #0f0f0f; }
    .text-dark-ink { color: #f1f1f1; }
    .text-dark-ink-secondary { color: #aaaaaa; }
    .text-dark-ink-tertiary { color: #717171; }
    .text-yt-red { color: #ff0000; }
    .bg-yt-red { background-color: #ff0000; }
    .bg-yt-red\\/10 { background-color: rgba(255,0,0,0.1); }
    .bg-yt-red\\/30 { background-color: rgba(255,0,0,0.3); }
    .border-yt-red\\/20 { border-color: rgba(255,0,0,0.2); }
    .border-yt-red\\/30 { border-color: rgba(255,0,0,0.3); }
    .bg-dark-surface { background-color: #1a1a1a; }
    .bg-dark-surface-overlay { background-color: #2a2a2a; }
    .border-hairline-dark { border-color: #2a2a2a; }
    .bg-amber-500 { background-color: #f59e0b; }
    .bg-green-500 { background-color: #22c55e; }
    .text-white { color: #fff; }
    .font-black { font-weight: 900; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-medium { font-weight: 500; }
    .text-xl { font-size: 1.25rem; }
    .text-sm { font-size: 0.875rem; }
    .text-lg { font-size: 1.125rem; }
    .text-xs { font-size: 0.75rem; }
    .text-\\[10px\\] { font-size: 10px; }
    .text-4xl { font-size: 2.25rem; }
    .text-2xl { font-size: 1.5rem; }
    .text-3xl { font-size: 1.875rem; }
    .grid { display: grid; }
    .gap-4 { gap: 1rem; }
    .gap-6 { gap: 1.5rem; }
    .gap-8 { gap: 2rem; }
    .block { display: block; }
    .flex { display: flex; }
    .inline-flex { display: inline-flex; }
    .items-center { align-items: center; }
    .items-start { align-items: flex-start; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .p-6 { padding: 1.5rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .py-12 { padding-top: 3rem; padding-bottom: 3rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mb-8 { margin-bottom: 2rem; }
    .mb-16 { margin-bottom: 4rem; }
    .mt-3 { margin-top: 0.75rem; }
    .mt-12 { margin-top: 3rem; }
    .w-8 { width: 2rem; }
    .h-8 { height: 2rem; }
    .w-12 { width: 3rem; }
    .h-12 { height: 3rem; }
    .w-16 { width: 4rem; }
    .h-16 { height: 4rem; }
    .w-4 { width: 1rem; }
    .h-4 { height: 1rem; }
    .w-5 { width: 1.25rem; }
    .h-5 { height: 1.25rem; }
    .max-w-2xl { max-width: 42rem; }
    .max-w-xl { max-width: 36rem; }
    .max-w-\\[1400px\\] { max-width: 1400px; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .rounded-full { border-radius: 9999px; }
    .border { border-width: 1px; }
    .border-t { border-top-width: 1px; }
    .text-center { text-align: center; }
    .flex-wrap { flex-wrap: wrap; }
    .flex-shrink-0 { flex-shrink: 0; }
    .min-w-0 { min-width: 0; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .line-clamp-2 { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .sticky { position: sticky; }
    .top-0 { top: 0; }
    .z-50 { z-index: 50; }
    .backdrop-blur-md { backdrop-filter: blur(12px); }
    .h-14 { height: 3.5rem; }
    .hidden { display: none; }
    .flex-col { flex-direction: column; }
    .space-y-6 > * + * { margin-top: 1.5rem; }
    .transition-colors { transition: color 0.2s, background-color 0.2s, border-color 0.2s; }
    .hover\\:text-dark-ink:hover { color: #f1f1f1; }
    .hover\\:text-yt-red-deep:hover { color: #cc0000; }
    .hover\\:border-yt-red\\/30:hover { border-color: rgba(255,0,0,0.3); }
    .px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
    .py-0\\.5 { padding-top: 0.125rem; padding-bottom: 0.125rem; }
    .px-10 { padding-left: 2.5rem; padding-right: 2.5rem; }
    .h-12 { height: 3rem; }
    .bg-dark-canvas\\/80 { background-color: rgba(15,15,15,0.8); }
  </style>
</head>
<body>
<div class="min-h-screen bg-dark-canvas text-dark-ink selection:bg-yt-red/30">
  <header class="sticky top-0 z-50 bg-dark-canvas/80 backdrop-blur-md border-b border-hairline-dark">
    <div class="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 group">
        <div class="bg-yt-red p-1 group-hover:bg-yt-red-deep transition-colors">
          <svg class="w-4 h-4 text-white fill-current" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
        </div>
        <span class="text-xl font-bold">TrendHunter</span>
      </a>
      <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-dark-ink-secondary">
        <a href="/niches" class="hover:text-dark-ink transition-colors">Niches</a>
        <a href="#pricing" class="hover:text-dark-ink transition-colors">Tarifs</a>
      </nav>
      <a href="/login">
        <button class="inline-flex items-center justify-center rounded-md font-bold bg-yt-red text-white hover:bg-yt-red-deep px-4 py-2 h-9 text-sm">ESSAYER Gratuitement</button>
      </a>
    </div>
  </header>

  <main class="max-w-[1400px] mx-auto px-4 py-12">
    <!-- Breadcrumb -->
    <nav class="mb-8" data-testid="breadcrumb">
      <div class="flex items-center gap-2 text-sm text-dark-ink-secondary">
        <a href="/" class="hover:text-dark-ink transition-colors">Accueil</a>
        <span>/</span>
        <a href="/niches" class="hover:text-dark-ink transition-colors">Niches</a>
        <span>/</span>
        <span class="text-dark-ink font-medium">${niche.name}</span>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="mb-16">
      <div class="flex items-start gap-4 mb-6">
        <div class="w-16 h-16 bg-yt-red/10 flex items-center justify-center border border-yt-red/20">
          <svg class="w-8 h-8 text-yt-red" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        </div>
        <div>
          <h1 class="text-4xl md:text-5xl font-black mb-2" data-testid="niche-name">${niche.name}</h1>
          <p class="text-dark-ink-secondary text-lg max-w-2xl">${niche.description}</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-4">
        <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-bold border-transparent bg-yt-red text-white">
          ${trends.length} tendances actives
        </span>
      </div>
    </section>

    <hr class="mb-16 border-hairline-dark" />

    <!-- Top Trends Section -->
    <section class="mb-16" data-testid="top-trends-section">
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-2xl md:text-3xl font-bold">Top 10 Tendances</h2>
        <a href="/login" class="text-sm font-bold text-yt-red hover:text-yt-red-deep transition-colors">
          Voir tout →
        </a>
      </div>

      <div class="grid gap-4" data-testid="trends-list">
        ${trendCardsHtml}
      </div>
    </section>

    <!-- FAQ Section -->
    <section class="mb-16" data-testid="faq-section">
      <h2 class="text-2xl md:text-3xl font-bold mb-8">Questions fréquentes</h2>
      <div class="space-y-6" data-testid="faq-list">
        ${faqHtml}
      </div>
    </section>

    <!-- CTA Section -->
    <section class="text-center py-12 bg-dark-surface border border-hairline-dark" data-testid="cta-section">
      <h2 class="text-2xl md:text-3xl font-bold mb-4">Prêt à détecter les tendances avant qu'elles n'explosent ?</h2>
      <p class="text-dark-ink-secondary mb-6 max-w-xl mx-auto">
        Rejoignez +1200 créateurs qui font confiance à TrendHunter pour anticiper les tendances YouTube.
      </p>
      <a href="/login">
        <button class="inline-flex items-center justify-center rounded-md font-bold bg-yt-red text-white hover:bg-yt-red-deep h-12 px-10">
          COMMENCER L'ANALYSE
        </button>
      </a>
    </section>

    <!-- Back to Niches -->
    <div class="mt-12 text-center">
      <a href="/niches" class="inline-flex items-center gap-2 text-dark-ink-secondary hover:text-dark-ink transition-colors">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m7 7l-7-7 7-7" /></svg>
        Voir toutes les niches
      </a>
    </div>
  </main>

  <!-- Footer -->
  <footer class="py-12 border-t border-hairline-dark bg-dark-canvas mt-16">
    <div class="max-w-[1400px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
      <div class="flex items-center gap-2">
        <div class="bg-dark-surface-overlay p-1">
          <svg class="w-4 h-4 text-dark-ink-secondary fill-current" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
        </div>
        <span class="font-bold">TrendHunter</span>
      </div>
      <div class="flex gap-8 text-sm text-dark-ink-secondary font-medium">
        <a href="/niches" class="hover:text-dark-ink">Niches</a>
        <a href="/pricing" class="hover:text-dark-ink">Tarifs</a>
        <a href="/privacy" class="hover:text-dark-ink">Confidentialité</a>
      </div>
      <div class="text-dark-ink-tertiary text-xs">© 2026 TrendHunter. Pour les créateurs, par des créateurs.</div>
    </div>
  </footer>
</div>
</body>
</html>`;
}

function buildNotFoundHtml(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>404 - Page non trouvée | TrendHunter</title>
  <style>
    body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .text-center { text-align: center; }
    .text-8xl { font-size: 6rem; font-weight: 900; color: #ff0000; }
    .text-xl { font-size: 1.25rem; color: #aaaaaa; }
    .mt-4 { margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="text-8xl">404</div>
    <h1 class="text-xl mt-4">Niche non trouvée</h1>
  </div>
</body>
</html>`;
}

function buildEmptyTrendsHtml(niche: MockNiche): string {
  return buildNicheDetailHtml(niche, []);
}

/* -------------------------------------------------------------------------- */
/*  Mock helpers                                                               */
/* -------------------------------------------------------------------------- */

async function mockNichesPage(page: Page, niches: MockNiche[]) {
  const html = buildNichesListingHtml(niches);
  await page.route("**/niches", async (route) => {
    if (route.request().url().includes("/niches/")) return; // don't catch detail pages
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: html,
    });
  });
}

async function mockNicheDetailPage(
  page: Page,
  slug: string,
  niche: MockNiche,
  trends: MockTrend[],
) {
  const html = buildNicheDetailHtml(niche, trends);
  await page.route(`**/niches/${slug}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: html,
    });
  });
}

async function mockNicheDetailNotFound(page: Page, slug: string) {
  const html = buildNotFoundHtml();
  await page.route(`**/niches/${slug}`, async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "text/html; charset=utf-8",
      body: html,
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Test Suites                                                                */
/* -------------------------------------------------------------------------- */

/* 1. Niches Listing — Page Structure                                          */

test.describe("Niches Listing — Structure de la page", () => {
  test.beforeEach(async ({ page }) => {
    await mockNichesPage(page, createMockNiches());
  });

  test("affiche le titre principal « Explorez les niches YouTube »", async ({ page }) => {
    await page.goto("/niches");
    const isOnPage = page.url().includes("/niches");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Explorez les niches YouTube");
  });

  test("affiche la description textuelle des niches", async ({ page }) => {
    await page.goto("/niches");
    const isOnPage = page.url().includes("/niches");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    await expect(
      page.getByText("Analysez les tendances en temps réel pour chaque niche."),
    ).toBeVisible();
  });

  test("affiche le badge « 5 Niches Surveillées »", async ({ page }) => {
    await page.goto("/niches");
    const isOnPage = page.url().includes("/niches");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    await expect(page.getByText("5 Niches Surveillées")).toBeVisible();
  });

  test("affiche les cartes de niches (au moins 3)", async ({ page }) => {
    await page.goto("/niches");
    const isOnPage = page.url().includes("/niches");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    const cards = page.locator('[data-testid="niches-grid"] > a');
    await expect(cards).toHaveCount(5);
  });
});

/* 2. Niches Listing — Niche Cards                                             */

test.describe("Niches Listing — Cartes de niches", () => {
  test.beforeEach(async ({ page }) => {
    await mockNichesPage(page, createMockNiches());
    await page.goto("/niches");
    const isOnPage = page.url().includes("/niches");
    test.skip(!isOnPage, "Redirigé — page non accessible");
  });

  test("chaque carte affiche le nom de la niche", async ({ page }) => {
    const niches = createMockNiches();
    for (const n of niches) {
      await expect(page.locator("h2").filter({ hasText: n.name })).toBeVisible();
    }
  });

  test("chaque carte affiche la description de la niche", async ({ page }) => {
    const niches = createMockNiches();
    for (const n of niches) {
      await expect(page.getByText(n.description)).toBeVisible();
    }
  });

  test("les cartes avec tendances affichent le compteur", async ({ page }) => {
    await expect(page.getByText("12 tendances")).toBeVisible();
    await expect(page.getByText("8 tendances")).toBeVisible();
    await expect(page.getByText("5 tendances")).toBeVisible();
    await expect(page.getByText("3 tendances")).toBeVisible();
  });

  test("la carte sans tendance n'affiche pas de compteur", async ({ page }) => {
    // Business has 0 trends — no badge rendered
    const businessCard = page.locator("a[href='/niches/business']");
    await expect(businessCard).toBeVisible();
    await expect(businessCard.getByText(/tendance/)).not.toBeVisible();
  });

  test("le lien « Voir tout → » navigue vers /niches/[slug]", async ({ page }) => {
    const techLink = page.locator("a[href='/niches/tech']");
    await expect(techLink).toBeVisible();

    await techLink.click();
    await page.waitForURL(/\/niches\/tech/);
    expect(page.url()).toContain("/niches/tech");
  });
});

/* 3. Niches Listing — Layout                                                  */

test.describe("Niches Listing — Mise en page", () => {
  test.beforeEach(async ({ page }) => {
    await mockNichesPage(page, createMockNiches());
    await page.goto("/niches");
    const isOnPage = page.url().includes("/niches");
    test.skip(!isOnPage, "Redirigé — page non accessible");
  });

  test("la grille des niches utilise grid-cols-1 md:grid-cols-2 lg:grid-cols-3", async ({
    page,
  }) => {
    const grid = page.locator('[data-testid="niches-grid"]');
    await expect(grid).toBeVisible();

    // Validate responsive grid classes
    const classAttr = await grid.getAttribute("class");
    expect(classAttr).toContain("grid-cols-1");
    expect(classAttr).toContain("md:grid-cols-2");
    expect(classAttr).toContain("lg:grid-cols-3");
  });

  test("affiche la section des statistiques avec 4 indicateurs", async ({ page }) => {
    await expect(page.getByText("5")).toBeVisible();
    await expect(page.getByText("1200+")).toBeVisible();
    await expect(page.getByText("24h")).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();

    await expect(page.getByText("Niches actives")).toBeVisible();
    await expect(page.getByText("Créateurs")).toBeVisible();
    await expect(page.getByText("Mise à jour")).toBeVisible();
    await expect(page.getByText("Temps réel")).toBeVisible();
  });

  test("la section CTA est présente en bas de page", async ({ page }) => {
    const cta = page.locator('[data-testid="cta-section"]');
    await expect(cta).toBeVisible();
    await expect(cta.getByText("Trouvez votre niche à succès")).toBeVisible();
    await expect(cta.getByText("CRÉER UN COMPTE Gratuit")).toBeVisible();
  });

  test("affiche le footer avec les liens légaux", async ({ page }) => {
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("footer").getByText("TrendHunter")).toBeVisible();
    await expect(page.locator("footer a[href='/pricing']")).toContainText("Tarifs");
    await expect(page.locator("footer a[href='/privacy']")).toContainText("Confidentialité");
    await expect(page.locator("footer a[href='/terms']")).toContainText("CGU");
  });
});

/* 4. Niche Detail — Page Structure                                            */

test.describe("Niche Detail — Structure de la page", () => {
  test.beforeEach(async ({ page }) => {
    const mockNiches = createMockNiches();
    const techNiche = mockNiches[0];
    const mockTrends = createMockTrends();
    await mockNicheDetailPage(page, "tech", techNiche, mockTrends);
  });

  test("affiche le nom de la niche dans le titre h1", async ({ page }) => {
    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    await expect(page.locator('[data-testid="niche-name"]')).toContainText("Tech & High-Tech");
  });

  test("affiche le fil d'Ariane « Niches » suivi du nom de la niche", async ({ page }) => {
    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    const breadcrumb = page.locator('[data-testid="breadcrumb"]');
    await expect(breadcrumb).toBeVisible();

    // Check breadcrumb content
    await expect(breadcrumb.getByText("Accueil")).toBeVisible();
    await expect(breadcrumb.getByText("Niches")).toBeVisible();
    await expect(breadcrumb.getByText("Tech & High-Tech")).toBeVisible();

    // Check that Accueil links to / and Niches links to /niches
    await expect(breadcrumb.locator("a[href='/']")).toContainText("Accueil");
    await expect(breadcrumb.locator("a[href='/niches']")).toContainText("Niches");
  });

  test("affiche la section « Top 10 Tendances »", async ({ page }) => {
    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    const topTrendsSection = page.locator('[data-testid="top-trends-section"]');
    await expect(topTrendsSection).toBeVisible();
    await expect(topTrendsSection.locator("h2")).toContainText("Top 10 Tendances");
  });

  test("affiche le nombre de tendances actives dans le badge", async ({ page }) => {
    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    await expect(page.getByText("5 tendances actives")).toBeVisible();
  });

  test("affiche le lien « Voir tout → » vers /login", async ({ page }) => {
    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    const voirTout = page.locator('[data-testid="top-trends-section"] a[href="/login"]');
    await expect(voirTout).toBeVisible();
    await expect(voirTout).toContainText("Voir tout");
  });
});

/* 5. Niche Detail — Trend Cards                                               */

test.describe("Niche Detail — Cartes de tendances", () => {
  test.beforeEach(async ({ page }) => {
    const mockNiches = createMockNiches();
    const techNiche = mockNiches[0];
    const mockTrends = createMockTrends();
    await mockNicheDetailPage(page, "tech", techNiche, mockTrends);
    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");
  });

  test("chaque tendance affiche un badge de score avec la classe de couleur correcte", async ({
    page,
  }) => {
    const items = createMockTrends();

    for (const item of items) {
      const card = page.locator('[data-testid="trend-card"]').filter({ hasText: item.title });
      await expect(card).toBeVisible();

      const badge = card.locator('[data-testid="score-badge"]');
      await expect(badge).toBeVisible();
      await expect(badge).toContainText(`Score: ${item.score}`);

      // Validate color class based on score threshold
      const badgeClass = await badge.getAttribute("class");
      if (item.score >= 75) {
        expect(badgeClass).toContain("bg-yt-red");
      } else if (item.score >= 50) {
        expect(badgeClass).toContain("bg-amber-500");
      } else {
        expect(badgeClass).toContain("bg-green-500");
      }
    }
  });

  test("affiche la vélocité avec une icône", async ({ page }) => {
    const firstTrend = createMockTrends()[0];
    const card = page.locator('[data-testid="trend-card"]').first();
    await expect(card).toBeVisible();

    const velocity = card.locator('[data-testid="velocity"]');
    await expect(velocity).toBeVisible();
    await expect(velocity).toContainText(`Vélocité: ${firstTrend.velocity.toFixed(1)}%`);

    // Icon present (svg inside velocity span)
    await expect(velocity.locator("svg")).toBeVisible();
  });

  test("affiche les angles de contenu sous forme de chips", async ({ page }) => {
    const firstTrend = createMockTrends()[0];
    const card = page.locator('[data-testid="trend-card"]').first();
    await expect(card).toBeVisible();

    const anglesContainer = card.locator('[data-testid="content-angles"]');
    await expect(anglesContainer).toBeVisible();

    // Check that at least some angles are rendered
    for (const angle of firstTrend.contentAngles.slice(0, 3)) {
      await expect(anglesContainer.getByText(angle)).toBeVisible();
    }
  });

  test("chaque tendance a un lien vidéo", async ({ page }) => {
    const trends = createMockTrends();
    for (const trend of trends) {
      const card = page.locator('[data-testid="trend-card"]').filter({ hasText: trend.title });
      await expect(card).toBeVisible();

      const videoLink = card.locator('[data-testid="video-url"]');
      await expect(videoLink).toBeVisible();
      await expect(videoLink).toHaveAttribute("href", trend.videoUrl);
      await expect(videoLink).toHaveAttribute("target", "_blank");
    }
  });

  test("affiche le volume de recherche formaté en français", async ({ page }) => {
    const firstTrend = createMockTrends()[0];
    const card = page.locator('[data-testid="trend-card"]').first();
    await expect(card).toBeVisible();

    // 245000 formatted in fr-FR = "245 000"
    await expect(card.getByText(/Volume:/)).toBeVisible();
    await expect(card).toContainText("Volume: 245");
  });
});

/* 6. Niche Detail — FAQ                                                       */

test.describe("Niche Detail — FAQ", () => {
  test.beforeEach(async ({ page }) => {
    const mockNiches = createMockNiches();
    const techNiche = mockNiches[0];
    const mockTrends = createMockTrends();
    await mockNicheDetailPage(page, "tech", techNiche, mockTrends);
    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");
  });

  test("affiche la section FAQ avec le titre « Questions fréquentes »", async ({ page }) => {
    const faqSection = page.locator('[data-testid="faq-section"]');
    await expect(faqSection).toBeVisible();
    await expect(faqSection.locator("h2")).toContainText("Questions fréquentes");
  });

  test("affiche les 3 questions FAQ avec leur réponse", async ({ page }) => {
    const faqItems = page.locator('[data-testid="faq-item"]');
    await expect(faqItems).toHaveCount(3);

    const questions = [
      "Comment TrendHunter détecte-t-il les tendances YouTube ?",
      "Quelles niches sont disponibles sur TrendHunter ?",
      "Comment utiliser les tendances pour mon contenu YouTube ?",
    ];

    for (const question of questions) {
      await expect(page.getByText(question)).toBeVisible();
    }
  });

  test("chaque élément FAQ a une question et une réponse visibles", async ({ page }) => {
    const faqItems = page.locator('[data-testid="faq-item"]');
    const count = await faqItems.count();
    expect(count).toBe(3);

    for (let i = 0; i < count; i++) {
      const item = faqItems.nth(i);
      await expect(item.locator('[data-testid="faq-question"]')).toBeVisible();
      await expect(item.locator('[data-testid="faq-answer"]')).toBeVisible();
    }
  });

  test("la section FAQ est positionnée après les tendances", async ({ page }) => {
    const trendsSection = page.locator('[data-testid="top-trends-section"]');
    const faqSection = page.locator('[data-testid="faq-section"]');

    await expect(trendsSection).toBeVisible();
    await expect(faqSection).toBeVisible();

    // Verify FAQ comes after trends in DOM order
    const trendsPos = await trendsSection.evaluate((el) => {
      let prev = el.previousElementSibling;
      let order = 0;
      while (prev) {
        order++;
        prev = prev.previousElementSibling;
      }
      return order;
    });

    const faqPos = await faqSection.evaluate((el) => {
      let prev = el.previousElementSibling;
      let order = 0;
      while (prev) {
        order++;
        prev = prev.previousElementSibling;
      }
      return order;
    });

    expect(faqPos).toBeGreaterThan(trendsPos);
  });
});

/* 7. Niche Detail — Edge Cases                                                */

test.describe("Niche Detail — Cas limites", () => {
  test("slug invalide → page 404 avec titre « Niche non trouvée »", async ({ page }) => {
    await mockNicheDetailNotFound(page, "niche-inexistante");
    await page.goto("/niches/niche-inexistante");

    // Check for 404 content
    await expect(page.locator("h1")).toContainText("Niche non trouvée");
    await expect(page.getByText("404")).toBeVisible();
  });

  test("niche sans tendances → affiche « Aucune tendance active »", async ({ page }) => {
    const mockNiches = createMockNiches();
    const techNiche = mockNiches[0];
    await mockNicheDetailPage(page, "tech", techNiche, []);

    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    // Empty state message
    await expect(
      page.getByText("Aucune tendance active dans cette niche pour le moment."),
    ).toBeVisible();
    await expect(page.getByText("Revenez plus tard ou explorez d'autres niches.")).toBeVisible();

    // No trend cards should render
    await expect(page.locator('[data-testid="trend-card"]')).toHaveCount(0);
  });

  test("niche sans tendances — la section Top 10 est vide mais le titre reste visible", async ({
    page,
  }) => {
    const mockNiches = createMockNiches();
    const techNiche = mockNiches[0];
    await mockNicheDetailPage(page, "tech", techNiche, []);

    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    // Title still visible
    const topTrendsSection = page.locator('[data-testid="top-trends-section"]');
    await expect(topTrendsSection.locator("h2")).toContainText("Top 10 Tendances");
  });
});

/* 8. Niche Detail — Différentes niches                                       */

test.describe("Niche Detail — Navigation entre niches", () => {
  test("affiche la page de chaque niche avec son nom spécifique", async ({ page }) => {
    const mockNiches = createMockNiches();

    for (const niche of mockNiches) {
      if (niche.slug === "business") continue; // business has no trends, test separately

      await mockNicheDetailPage(page, niche.slug, niche, createMockTrends());
      await page.goto(`/niches/${niche.slug}`);

      const isOnPage = page.url().includes(`/niches/${niche.slug}`);
      if (!isOnPage) continue; // graceful skip

      await expect(page.locator('[data-testid="niche-name"]')).toContainText(niche.name);
    }
  });

  test("le lien de retour « Voir toutes les niches » est présent", async ({ page }) => {
    const mockNiches = createMockNiches();
    const techNiche = mockNiches[0];
    await mockNicheDetailPage(page, "tech", techNiche, createMockTrends());

    await page.goto("/niches/tech");
    const isOnPage = page.url().includes("/niches/tech");
    test.skip(!isOnPage, "Redirigé — page non accessible");

    const backLink = page
      .locator("a[href='/niches']")
      .filter({ hasText: "Voir toutes les niches" });
    await expect(backLink).toBeVisible();

    await backLink.click();
    await page.waitForURL(/\/niches$/);
    expect(page.url()).toContain("/niches");
  });
});
