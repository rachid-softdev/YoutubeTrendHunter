# Revue de code — YouTube TrendHunter

> Analyse complète du projet au 4 juin 2026.

---

## Résumé

Application de veille YouTube avec score IA, abonnements Stripe, dashboard web et extension Chrome. Stack Next.js 16 + Prisma/PostgreSQL + NextAuth v5.

**État général : fonctionnel mais inachevé.** Le squelette est solide, plusieurs pages et fonctionnalités sont des placeholders, et des incohérences entre le plan initial (PLAN.md) et la réalité du code sont nombreuses.

---

## Architecture

### Structure des dossiers

Bonne séparation en route groups Next.js (`(auth)`, `(dashboard)`, `(marketing)`). Les API routes sont collées aux pages — standard App Router. Les librairies partagées sont dans `src/lib/`. Composants UI réutilisables dans `src/components/ui/`.

Problème : pas de dossier `hooks/` ni `services/`. La logique métier est dispersée entre les pages server components et les libs. Aucune couche d'abstraction entre Prisma et les pages.

### Base de données (Prisma)

10 modèles, propres et bien typés. Points à corriger :

- **Provider PostgreSQL** dans `schema.prisma`, mais les scripts de dev (`setup-mysql.js`) configurent **MySQL**. Incohérence bloquante — `prisma db push` échouera si le provider ne correspond pas à la base.
- **Pas de `@@unique([title, nicheId])`** sur Trend : le seed.ts essaie un upsert logique avec `.catch()` silencieux qui ignore les doublons. Mauvaise pratique.
- **ApiToken.token** : le schéma met `@default(cuid())` mais la route `extension/auth/route.ts` utilise `randomUUID()`. Les deux divergent.
- **Alerte** : pas de relation vers Niche (`nicheId` présent mais pas de `@relation`). Un `nicheId` nullable sans contrainte d'intégrité.
- **Pas d'index** sur `Subscription.userId` (unique, donc déjà couvert) mais `stripeSubscriptionId` n'a pas d'index explicite.

### Cache Redis (Upstash)

Le PLAN.md dédie une section entière à Upstash Redis, avec caching des tendances et des niches. **Aucune implémentation** dans le code actuel. `@upstash/redis` est installé dans `package.json` mais jamais importé. Aucune route n'utilise de cache. Le site s'appuie exclusivement sur Prisma à chaque requête.

---

## Sécurité

### Problèmes critiques

| # | Problème | Fichier | Gravité |
|---|----------|---------|---------|
| 1 | **Mot de passe MySQL en dur** | `scripts/setup-mysql.js` | **CRITIQUE** — `root`/`azerty123` en clair |
| 2 | **Status toujours ACTIVE** | `stripe/webhook/route.ts:78` | **HAUTE** — `customer.subscription.updated` force `ACTIVE` même si Stripe dit `past_due` ou `incomplete` |
| 3 | **Aucune validation du priceId** | `stripe/checkout/route.ts` | **MOYENNE** — n'importe quel priceId Stripe est accepté |
| 4 | **Fuite d'infos utilisateur** | `extension/trends/route.ts:42` | **MOYENNE** — l'API extension renvoie `user.name` et `user.email` sans nécessité |
| 5 | **Tokens en clair en BDD** | `prisma/schema.prisma` | **MOYENNE** — les tokens API sont stockés en texte brut, pas de hash |
| 6 | **Destruction de tous les tokens** | `extension/auth/route.ts:12` | **BASSE** — regénérer un token supprime tous les précédents sans avertissement |
| 7 | **Force push vers main** | `gh.sh` / `gh.ps1` | **HAUTE** — scripts destructeurs qui réécrivent l'historique git |
| 8 | **Parsing JSON sans validation** | `lib/trend-scorer.ts:56` | **MOYENNE** — `JSON.parse()` du retour Claude peut planter ou retourner n'importe quoi |
| 9 | **Pas de rate limiting** | Toutes les routes API | **MOYENNE** — aucune protection contre les abus |
| 10 | **CORS** | Toutes les routes API | **BASSE** — pas de gestion CORS, l'extension en localhost peut fonctionner par hasard |

### Authentification

NextAuth v5 avec Google OAuth, stratégie database session, middleware de protection — solide. Points faibles : pas de refresh token rotatif, pas de mécanisme de révocation de session côté utilisateur.

---

## Fonctionnalités

### Implémentées ✅

- Authentification Google OAuth
- Stripe Checkout + Customer Portal + Webhooks (partiel)
- Dashboard tendances avec filtrage par niche
- Plan Free/Pro/Team avec limites (5 ou 20 tendances)
- Scoring IA via Anthropic Claude
- Extension Chrome (sidebar + background worker)
- Génération de token API pour l'extension
- Landing page marketing + page de tarifs

### Partielles / Placeholder 🟡

| Page/Fonction | Statut | Détail |
|---------------|--------|--------|
| **Alertes** (`/alerts`) | Placeholder | Affiche « Aucune alerte configurée », bouton "Créer" sans action. Aucun CRUD. |
| **Niches** (`/niches`) | Placeholder | Liste les niches mais boutons "Suivre" sans serveur action. Impossible de follow/unfollow. |
| **Scoring IA** | Bypassé | `scoreTrend()` jamais appelé — les tendances en BDD ont des scores statiques du seed. |
| **Cache Redis** | Absent | `@upstash/redis` installé, jamais utilisé. |
| **Extension content script** | Stub | `content.js` = `console.log("TrendHunter loaded")` uniquement. |
| **Notifications email** | Absentes | Resend installé, aucune route d'envoi. |
| **API Niches** | Absente | PLAN.md prévoit `/api/niches`, inexistante. |
| **API Trend [id]** | Absente | PLAN.md prévoit `/api/trends/[id]`, inexistante. |

### Non implémentées ❌

- Création / modification / suppression d'alertes
- Envoi d'emails (Resend installé mais pas utilisé)
- Historique des tendances
- Export CSV
- Dashboard admin
- Blog / sitemap (cités dans PLAN.md)
- Tests (aucun test — ni unitaire, ni intégration, ni e2e)
- CI fonctionnelle (GitHub Actions citée dans l'historique git)

---

## Qualité du code

### Points positifs

- Composants UI réutilisables (Button, Badge, Input) avec variants propres
- Server components par défaut, client components minimaux
- Sessions typées via module augmentation (`src/types/index.ts`)
- Plan limits centralisé dans `plan-check.ts`
- Webhook Stripe avec signature verification
- Gestion des limites plan cohérente entre route API et page dashboard

### Problèmes de qualité

1. **`any` partout dans le webhook Stripe** — `event.data.object as any`, `sub as any`. Types Stripe ignorés.
2. **Palier `-1` pour unlimited** — `PLAN_LIMITS` utilise `-1` pour illimité. Les routes font des `take: 5` ou `take: 20` en dur, ignorant `PLAN_LIMITS.trendsPerNiche` (sauf dans `api/trends/route.ts` mais avec un fallback 20 en dur).
3. **Pas de singleton Prisma** — `new PrismaClient({})` sans global. Multiples instances en hot reload dev.
4. **Seed silencieux** — `.catch(() => {})` ignore les erreurs d'insertion. Si un trend existe déjà, on ne le saura pas.
5. **`setup-admin.ts` n'est pas du TypeScript** — c'est un fichier texte avec des `console.log`.
6. **Noms de scripts incohérents** — certains en `.ts`, d'autres en `.js`, parfois les deux pour la même fonction (`create-stripe-products.ts` et `create-stripe-products.js`).
7. **`lang="en"`** dans le layout racine alors que 100% de l'UI est en français.
8. **`--webpack`** dans les scripts dev — Next.js 16 utilise Turbopack par défaut, ce flag force Webpack sans nécessité documentée.

---

## PLAN.md vs Réalité

Le document PLAN.md (3069 lignes) est détaillé mais trompeur. De nombreuses sections listent des fonctionnalités comme implémentées qui ne le sont pas :

| Section PLAN.md | Implémenté ? | Notes |
|-----------------|-------------|-------|
| Cache Upstash Redis | ❌ | Jamais écrit |
| Hooks (`useTrends`, `useAlerts`) | ❌ | Pas de dossier `hooks/` |
| API routes complètes | 🟡 | `/api/trends/[id]`, `/api/niches`, `/api/alerts` manquants |
| Pages alerts CRUD | ❌ | Page statique uniquement |
| Dashboard admin | ❌ | Route `admin` planifiée mais pas créée |
| Email notifications | ❌ | Resend installé, rien d'implémenté |
| Tests | ❌ | Aucun test |

**Recommandation :** Mettre à jour PLAN.md pour refléter la réalité, ou supprimer les sections non implémentées.

---

## Extension Chrome

L'extension (Manifest V3) est fonctionnelle mais limitée :

- **URLs en dur** `http://localhost:3000` — aucune gestion d'environnement.
- **Content script** : stub. Ne fait rien sur YouTube.
- **Sidebar** : UI propre mais pas d'affichage des `contentAngles` (pourtant dans les données).
- **Auth** : token stocké dans `chrome.storage.sync` en clair.
- **`background.js`** : utilise `chrome.sidePanel` API, bien.

---

## Recommandations

### Priorité haute

1. **Alignement Prisma provider** — décider MySQL ou PostgreSQL, corriger le schema ET les scripts.
2. **Sécurité webhook** — ne pas forcer `ACTIVE` systématiquement. Vérifier le statut réel Stripe.
3. **Mot de passe MySQL** — supprimer le hardcode, utiliser des variables d'environnement.

### Priorité moyenne

4. **Supprimer les placeholders** — soit implémenter les pages Alertes et Niches, soit les retirer du menu.
5. **Ajouter un cache Redis** — une couche Redis entre Prisma et les routes API, comme prévu.
6. **Valider la sortie Claude** — ajouter `safeParse` Zod sur `JSON.parse` dans `scoreTrend`.
7. **Singleton Prisma** — pattern global standard pour éviter les connexions multiples.

### Priorité basse

8. **Harmoniser les scripts** — `.ts` ou `.js`, pas les deux.
9. **Corriger `lang="en"`** → `lang="fr"`.
10. **Mettre à jour ou supprimer PLAN.md**.
11. **Remplacer les `any`** du webhook Stripe par des types.
12. **Rendre les URLs de l'extension configurables** (variables d'environnement ou build-time).
13. **Ajouter un `.env.example`** — cité par les scripts mais inexistant.

---

## Conclusion

Projet avec une base technique correcte (Next.js 16, App Router, Prisma, Stripe, NextAuth) mais qui souffre d'un décalage important entre ce qui est planifié et ce qui est réellement codé. Plusieurs pages critiques sont des coquilles vides, des dépendances entières (`@upstash/redis`, `resend`) sont installées mais jamais utilisées, et la sécuité a des trous notables (webhook, password en clair).

**Estimation : ~40-50% du périmètre PLAN.md réellement livré.** Un effort de 2-3 semaines est nécessaire pour atteindre un état "production-ready" (finir les pages, ajouter le cache, les tests, sécuriser les webhooks, nettoyer les scripts).

---

*Revue réalisée le 4 juin 2026 — branche `review`, commit `6d9b8c9`.*
