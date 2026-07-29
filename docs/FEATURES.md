# Fonctionnalités de TrendHunter

> Généré le 28 juillet 2026 — Analyse complète de la codebase

---

## 1. Pages Marketing (publiques)

| # | Fonctionnalité | Route | Statut |
|---|---------------|-------|--------|
| 1.1 | **Landing Page** — Hero, features grid, pricing section, CTA, footer | `/` | ✅ |
| 1.2 | **Page Tarifs** — Plans Free/Pro/Team, comparaison | `/pricing` | ✅ |
| 1.3 | **Page Fonctionnalités** — Détail complet des features | `/features` | ✅ |
| 1.4 | **Blog** — Liste d'articles | `/blog` | ✅ |
| 1.5 | **Article de Blog** — Page dynamique par slug | `/blog/[slug]` | ✅ |
| 1.6 | **Niches Index** — Toutes les niches disponibles | `/niches` | ✅ |
| 1.7 | **Niches Détail** — Page par niche | `/niches/[slug]` | ✅ |
| 1.8 | **Page Comparatif** — TrendHunter vs VidIQ | `/comparatif/vidiq-trendhunter` | ✅ |
| 1.9 | **Page Confidentialité** | `/privacy` | ✅ |
| 1.10 | **Page CGU** | `/terms` | ✅ |

## 2. Authentification

| # | Fonctionnalité | Route | Statut |
|---|---------------|-------|--------|
| 2.1 | **Page Login** — Connexion Google OAuth | `/login` | ✅ |
| 2.2 | **NextAuth** — Auth avec adaptateur Prisma + GoogleProvider | `api/auth/[...nextauth]` | ✅ |
| 2.3 | **Middleware de protection** — Redirection si non connecté | `middleware.ts` | ✅ |
| 2.4 | **Session utilisateur** — Callback session avec plan | `lib/auth.ts` | ✅ |
| 2.5 | **CSRF Protection** — Validation origin/referer | `lib/csrf.ts` | ✅ |

## 3. Dashboard (authentifié)

| # | Fonctionnalité | Route | Statut |
|---|---------------|-------|--------|
| 3.1 | **Dashboard Accueil** — Liste des tendances avec sélecteur de niche | `/dashboard` | ✅ |
| 3.2 | **Mes Niches** — Suivre/ne plus suivre des niches | `/my-niches` | ✅ |
| 3.3 | **Alertes** — Créer et gérer des alertes de tendances | `/alerts` | ✅ |
| 3.4 | **Facturation** — Gérer abonnement et token API | `/billing` | ✅ |
| 3.5 | **Paramètres** — Gestion du compte | `/settings` | ✅ |
| 3.6 | **Administration** — Panel admin (users, niches, stats, monitoring) | `/admin` | ✅ |

### 3.7 Composants Dashboard

| # | Composant | Description |
|---|-----------|-------------|
| 3.7.1 | **Sidebar** — Navigation latérale desktop |
| 3.7.2 | **MobileNav** — Navigation mobile bottom |
| 3.7.3 | **TrendCard** — Carte d'affichage d'une tendance |
| 3.7.4 | **NicheSelector** — Menu déroulant de sélection de niche |
| 3.7.5 | **NicheGrid** — Grille d'affichage des niches |
| 3.7.6 | **NicheFollowButton** — Bouton follow/unfollow niche |
| 3.7.7 | **AlertsClient** — Gestion des alertes côté client |
| 3.7.8 | **AlertForm** — Formulaire de création d'alerte |
| 3.7.9 | **AlertList** — Liste des alertes |
| 3.7.10 | **ManageSubscriptionButton** — Gestion abonnement Stripe |
| 3.7.11 | **GenerateTokenButton** — Génération token API |
| 3.7.12 | **CopyButton** — Copie token dans le presse-papier |
| 3.7.13 | **SettingsContent** — Contenu des paramètres |
| 3.7.14 | **AuditLogViewer** — Visualisation des logs d'audit |

## 4. API Routes

### 4.1 Authentification

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.1.1 | `/api/auth/[...nextauth]` | GET/POST | Routes NextAuth |

### 4.2 Tendances

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.2.1 | `/api/trends` | GET | Liste des tendances avec pagination |
| 4.2.2 | `/api/trends/refresh` | POST | Rafraîchir les tendances (cron) |

### 4.3 Alertes

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.3.1 | `/api/alerts` | GET/POST | CRUD alertes |
| 4.3.2 | `/api/alerts/[id]` | PUT/DELETE | Modifier/supprimer une alerte |

### 4.4 Niches

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.4.1 | `/api/niches` | GET/POST | Lister/créer des niches |
| 4.4.2 | `/api/niches/[id]` | GET/PUT/DELETE | CRUD niche |

### 4.5 Extension Chrome

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.5.1 | `/api/extension/trends` | GET | Tendances pour l'extension |
| 4.5.2 | `/api/extension/auth` | GET/POST | Auth token pour extension |
| 4.5.3 | `/api/extension/analyze` | POST | Analyse de contenu |
| 4.5.4 | `/api/extension/trends/niches` | GET | Niches pour extension |

### 4.6 Stripe / Paiement

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.6.1 | `/api/stripe/checkout` | POST | Créer session de paiement |
| 4.6.2 | `/api/stripe/portal` | POST | Portail de gestion abonnement |
| 4.6.3 | `/api/stripe/webhook` | POST | Webhooks Stripe |

### 4.7 Utilisateur

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.7.1 | `/api/user` | GET/PUT | Profil utilisateur |
| 4.7.2 | `/api/user/export` | GET | Export des données |
| 4.7.3 | `/api/user/audit-logs` | GET | Logs d'activité |

### 4.8 Jobs & Cron

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.8.1 | `/api/cron/trends` | POST | Cron de rafraîchissement tendances |
| 4.8.2 | `/api/cron/process-jobs` | POST | Cron de traitement des jobs |
| 4.8.3 | `/api/jobs/[id]` | GET | Stats d'un job |

### 4.9 Admin

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.9.1 | `/api/admin/users` | GET | Lister les utilisateurs |
| 4.9.2 | `/api/admin/users/[id]` | GET/PUT/DELETE | CRUD utilisateur |
| 4.9.3 | `/api/admin/users/export` | GET | Export CSV utilisateurs |
| 4.9.4 | `/api/admin/niches` | GET/POST | CRUD niches |
| 4.9.5 | `/api/admin/niches/[id]` | PUT/DELETE | Modifier niche |
| 4.9.6 | `/api/admin/plans` | GET/POST | CRUD plans |
| 4.9.7 | `/api/admin/plans/[planKey]/features` | PUT | Features d'un plan |
| 4.9.8 | `/api/admin/features` | GET/POST | CRUD features |
| 4.9.9 | `/api/admin/features/[key]` | PUT/DELETE | Modifier feature |
| 4.9.10 | `/api/admin/overrides` | GET/POST | Surcharges de features |
| 4.9.11 | `/api/admin/overrides/[id]` | PUT/DELETE | Modifier surcharge |
| 4.9.12 | `/api/admin/stats` | GET | Statistiques globales |
| 4.9.13 | `/api/admin/metrics` | GET | Métriques avancées |
| 4.9.14 | `/api/admin/monitoring` | GET | Monitoring |
| 4.9.15 | `/api/admin/monitoring/stream` | GET | SSE monitoring |
| 4.9.16 | `/api/admin/orgs/[orgId]/entitlements` | GET | Entitlements org |
| 4.9.17 | `/api/admin/orgs/[orgId]/downgrade-preview` | GET | Preview downgrade |
| 4.9.18 | `/api/admin/cache/invalidate/[orgId]` | POST | Invalidation cache |

### 4.10 Entitlements & Feature Flags

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.10.1 | `/api/entitlements` | GET | Vérification entitlements |
| 4.10.2 | `/api/me/entitlements` | GET | Entitlements utilisateur courant |
| 4.10.3 | `/api/debug/entitlements` | GET | Debug entitlements |

### 4.11 Système

| # | Endpoint | Méthode | Description |
|---|----------|---------|-------------|
| 4.11.1 | `/api/health` | GET | Health check |

## 5. Extension Chrome

| # | Fonctionnalité | Fichier | Statut |
|---|---------------|---------|--------|
| 5.1 | **Manifest V3** — Configuration extension | `manifest.json` | ✅ |
| 5.2 | **Service Worker** — Gestion side panel, API calls | `background.js` | ✅ |
| 5.3 | **Content Script** — Injection sur YouTube | `content.js` | ✅ |
| 5.4 | **Sidebar** — UI de l'extension | `sidebar/index.html` | ✅ |
| 5.5 | **Styles sidebar** — Design system extension | `sidebar/style.css` | ✅ |
| 5.6 | **App logic sidebar** — State management, API calls | `sidebar/app.js` | ✅ |

## 6. Services (lib)

| # | Service | Fichier | Description |
|---|---------|---------|-------------|
| 6.1 | **Auth** | `lib/auth.ts` | Configuration NextAuth |
| 6.2 | **Prisma** | `lib/prisma.ts` | Client Prisma |
| 6.3 | **Plan Check** | `lib/services/subscription.service.ts` | Vérification plan utilisateur |
| 6.4 | **Trend Scoring IA** | `lib/trend-scorer.ts` | Scoring via Claude API |
| 6.5 | **Trend Pipeline** | `lib/trend-pipeline.ts` | Pipeline de traitement |
| 6.6 | **Trend Service** | `lib/services/trend.service.ts` | Service CRUD tendances |
| 6.7 | **Niche Service** | `lib/services/niche.service.ts` | Service CRUD niches |
| 6.8 | **Alert Service** | `lib/services/alert.service.ts` | Service CRUD alertes |
| 6.9 | **Subscription Service** | `lib/services/subscription.service.ts` | Gestion abonnements |
| 6.10 | **User Service** | `lib/services/user.service.ts` | Gestion utilisateurs |
| 6.11 | **Job Service** | `lib/services/job.service.ts` | File d'attente de jobs |
| 6.12 | **Stripe Adapter** | `lib/payment/stripe-adapter.ts` | Intégration Stripe |
| 6.13 | **Stripe Config** | `lib/payment/stripe-config.ts` | Configuration Stripe |
| 6.14 | **Stripe Webhook Handler** | `lib/payment/stripe-webhook-handler.ts` | Gestion webhooks |
| 6.15 | **Stripe Status Mapper** | `lib/payment/stripe-status-mapper.ts` | Mapping statuts |
| 6.16 | **Rate Limiting** | `lib/rate-limit.ts` | Rate limiting avec Redis/fallback |
| 6.17 | **Redis Cache** | `lib/redis.ts` | Cache Redis |
| 6.18 | **Cache Layer** | `lib/cache.ts` | Abstraction cache |
| 6.19 | **Anthropic/Claude** | `lib/anthropic.ts` | Client Claude API |
| 6.20 | **API Tokens** | `lib/api-tokens.ts` | Gestion tokens API |
| 6.21 | **Analytics** | `lib/analytics.ts` | Tracking analytics |
| 6.22 | **Email** | `lib/email.ts` | Envoi d'emails (Resend) |
| 6.23 | **Audit Log** | `lib/audit-log.ts` | Journalisation d'audit |
| 6.24 | **Logger** | `lib/logger.ts` | Logger structuré |
| 6.25 | **Observability** | `lib/observability.ts` | Observabilité |
| 6.26 | **Feature Flags** | `lib/feature-flags/` | Feature flags system |
| 6.27 | **Schemas Validation** | `lib/schemas.ts` | Schémas Zod |
| 6.28 | **Env Validation** | `lib/env.ts` | Validation d'environnement |
| 6.29 | **YouTube API** | `lib/youtube.ts` | Données YouTube |
| 6.30 | **Blog Service** | `lib/blog.ts` | Gestion contenu blog |
| 6.31 | **Validate URL** | `lib/validate-url.ts` | Validation URLs |
| 6.32 | **Security Alert** | `lib/security-alert.ts` | Alertes sécurité |
| 6.33 | **Retry** | `lib/retry.ts` | Mécanisme de retry |
| 6.34 | **Plans** | `lib/plans.ts` | Plans tarifaires |

## 7. Base de Données (Prisma)

| # | Modèle | Description |
|---|--------|-------------|
| 7.1 | **User** | Utilisateurs avec email, image |
| 7.2 | **Account** | Comptes OAuth (Google) |
| 7.3 | **Session** | Sessions base de données |
| 7.4 | **VerificationToken** | Tokens de vérification |
| 7.5 | **Subscription** | Abonnements Stripe |
| 7.6 | **Niche** | Niches de contenu |
| 7.7 | **UserNiche** | Relation utilisateur-niche |
| 7.8 | **Trend** | Tendances détectées |
| 7.9 | **Alert** | Alertes configurées |
| 7.10 | **ApiToken** | Tokens API pour extension |

## 8. Composants UI

| # | Composant | Fichier |
|---|-----------|---------|
| 8.1 | **Button** | `components/ui/button.tsx` |
| 8.2 | **Badge** | `components/ui/badge.tsx` |
| 8.3 | **Input** | `components/ui/input.tsx` |
| 8.4 | **Card** | `components/ui/card.tsx` |
| 8.5 | **Alert** | `components/ui/alert.tsx` |
| 8.6 | **Separator** | `components/ui/separator.tsx` |

## 9. Composants Généraux

| # | Composant | Description |
|---|-----------|-------------|
| 9.1 | **CookieConsent** | Bannière cookies |
| 9.2 | **ThemeToggle** | Dark/Light mode |
| 9.3 | **FeatureGuard** | Guard par feature flag |
| 9.4 | **ErrorBoundary** | Gestion d'erreurs |
| 9.5 | **AnalyticsClient** | Tracking client-side |
| 9.6 | **AnalyticsCTA** | CTA analytics |

## 10. SEO & Performance

| # | Fonctionnalité | Fichier |
|---|---------------|---------|
| 10.1 | **Sitemap** | `app/sitemap.ts` |
| 10.2 | **Robots.txt** | `app/robots.ts` |
| 10.3 | **Manifest** | `app/manifest.ts` |
| 10.4 | **Metadata** | Pages avec `generateMetadata` |
| 10.5 | **Canonical URLs** | Pages avec `alternates.canonical` |
| 10.6 | **OpenGraph** | Métadonnées sociales |
| 10.7 | **Security Headers** | `next.config.ts` |
| 10.8 | **Sentry** | Error tracking (3 configs) |
| 10.9 | **Loading UI** | Loading skeletons |
| 10.10 | **Error UI** | Pages d'erreur |
| 10.11 | **Global Error** | `global-error.tsx` |
| 10.12 | **Not Found** | `not-found.tsx` |

## 11. Tests

| # | Type | Nombre de fichiers |
|---|------|--------------------|
| 11.1 | **E2E Tests** (Playwright) | 82 fichiers dans `e2e/` |
| 11.2 | **Unit Tests** (Vitest) | Multiples dans `__tests__/` |
| 11.3 | **API Tests** | Dans `api/__tests__/` |
| 11.4 | **Component Tests** | Dans `components/__tests__/` |
| 11.5 | **Lib Tests** | Dans `lib/__tests__/` |
| 11.6 | **Prisma Tests** | Dans `prisma/__tests__/` |

## 12. Scripts & Outils

| # | Script | Description |
|---|--------|-------------|
| 12.1 | `scripts/setup-stripe.ts` | Configuration produits Stripe |
| 12.2 | `scripts/setup-stripe-cli.js` | Setup Stripe CLI |
| 12.3 | `scripts/stop-stripe-cli.js` | Arrêt Stripe CLI |
| 12.4 | `scripts/stripe-test-webhooks.js` | Test webhooks Stripe |
| 12.5 | `scripts/setup-mailhog.js` | Setup MailHog |
| 12.6 | `scripts/start-dev-complete.js` | Dev complet |
| 12.7 | `scripts/start-dev-with-mailhog.js` | Dev avec MailHog |
| 12.8 | `scripts/stop-mailhog.js` | Arrêt MailHog |
| 12.9 | `scripts/qa-web.js` | Quality assurance web |
| 12.10 | `prisma/seed.ts` | Seed base de données |

## 13. Infrastructure

| # | Technologie | Usage |
|---|-------------|-------|
| 13.1 | **Next.js 16.2** | Framework web |
| 13.2 | **React 19.2** | UI Library |
| 13.3 | **TypeScript 5** | Langage |
| 13.4 | **Prisma 6.19** | ORM |
| 13.5 | **PostgreSQL** | Base de données |
| 13.6 | **NextAuth 5** | Authentification |
| 13.7 | **Stripe** | Paiement |
| 13.8 | **Claude API** | IA scoring |
| 13.9 | **Redis (Upstash)** | Cache/Rate limiting |
| 13.10 | **Tailwind CSS** | Styles |
| 13.11 | **Turbo Repo** | Monorepo |
| 13.12 | **Biome** | Formatting |
| 13.13 | **pnpm** | Package manager |

---

## Résumé

**Total des fonctionnalités identifiées : ~120+**

| Catégorie | Nombre |
|-----------|--------|
| Pages marketing | 10 |
| Auth & middleware | 5 |
| Dashboard pages | 6 |
| Composants dashboard | 14 |
| API endpoints | ~50 |
| Extension Chrome | 6 |
| Services (lib) | 34 |
| Modèles BDD | 10 |
| Composants UI | 6 |
| Composants généraux | 6 |
| SEO/Performance | 12 |
| Tests | 82+ e2e + unitaires |
| Scripts | 10 |