# TrendHunter — Code Review Complète

---

## 🗺️ ÉTAPE 0 — Cartographie du Codebase

### Arborescence des modules clés (max 3 niveaux)

```
YoutubeTrendHunter/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── niches/page.tsx
│   │   │   ├── alerts/page.tsx
│   │   │   └── billing/page.tsx
│   │   ├── (marketing)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── pricing/page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── stripe/{checkout,portal,webhook}/route.ts
│   │   │   ├── trends/route.ts
│   │   │   └── extension/{auth,trends}/route.ts
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/{button,input,badge}.tsx
│   │   └── dashboard/{sidebar,trend-card,niche-selector,generate-token-button,manage-subscription-button}.tsx
│   ├── lib/{auth,prisma,stripe,anthropic,trend-scorer,plan-check,utils}.ts
│   ├── types/index.ts
│   └── proxy.ts (middleware)
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   └── sidebar/{index.html,app.js,style.css}
├── scripts/          ← 17 scripts (setup, stripe, mailhog, dev)
├── next.config.ts
├── tsconfig.json
├── package.json
├── AGENTS.md
├── PLAN.md
└── README.md
```

### Stack technique détectée

| Couche | Technologie | Version |
|---|---|---|
| Runtime | Node.js | - |
| Framework | Next.js | ^16.2.7 |
| UI Library | React | 19.2.4 |
| Styling | Tailwind CSS | ^4.3.0 |
| Auth | NextAuth (Auth.js) | ^5.0.0-beta.31 |
| ORM | Prisma | ^5.22.0 |
| Database | PostgreSQL (schema) / MySQL (scripts) | - |
| Payments | Stripe | ^22.1.0 |
| AI | Anthropic Claude | ^0.92.0 |
| Cache | Upstash Redis | ^1.37.0 |
| Email | Resend | ^6.12.2 |
| Extension | Chrome Manifest V3 | - |
| Icons | Lucide React | ^1.14.0 |
| Validation | Zod | ^4.4.2 |
| Dates | date-fns | ^4.1.0 |

### Points d'entrée principaux

- **Root layout**: `src/app/layout.tsx`
- **Middleware**: `src/proxy.ts` (auth guard via NextAuth middleware)
- **Auth handler**: `src/app/api/auth/[...nextauth]/route.ts`
- **Marketing pages**: `(marketing)/page.tsx` (landing), `(marketing)/pricing/page.tsx`
- **Dashboard pages**: `(dashboard)/dashboard/page.tsx` (trends), `(dashboard)/niches/page.tsx`, `(dashboard)/alerts/page.tsx`, `(dashboard)/billing/page.tsx`
- **API routes**: trends, stripe (checkout/portal/webhook), extension (auth/trends)
- **Extension**: `extension/background.js` (service worker), `extension/sidebar/index.html`

### Volume estimé

- Fichiers source (`.ts`, `.tsx`, `.css`, `.js`): ~37 fichiers dans `src/`
- Lignes de code TypeScript/TSX: ~1 390 lignes
- Extension Chrome: ~350 lignes (JS, HTML, CSS)
- Scripts: ~17 fichiers de devops
- Prisma schema: ~187 lignes (10 modèles, 5 enums)

### Dépendances externes principales

- **Production**: `@anthropic-ai/sdk`, `@auth/prisma-adapter`, `@prisma/client`, `@stripe/stripe-js`, `@upstash/redis`, `clsx`, `date-fns`, `lucide-react`, `next`, `next-auth`, `prisma`, `react`, `react-dom`, `resend`, `stripe`, `tailwind-merge`, `zod`
- **Dev**: `@tailwindcss/postcss`, `@types/node`, `@types/react`, `@types/react-dom`, `dotenv-cli`, `eslint`, `eslint-config-next`, `tailwindcss`, `tsx`, `typescript`

### Découpage en couches identifié

| Couche | Technologie | Localisation |
|---|---|---|
| **Presentation** (UI) | React Server Components + Client Components | `src/app/`, `src/components/` |
| **API** (Controllers) | Next.js App Router Route Handlers | `src/app/api/` |
| **Application** (Services) | Fonctions lib | `src/lib/plan-check.ts`, `src/lib/trend-scorer.ts` |
| **Domain** | Prisma models + Types | `prisma/schema.prisma`, `src/types/index.ts` |
| **Data Access** | Prisma Client | `src/lib/prisma.ts` + calls in routes |
| **Infrastructure** | Stripe, Anthropic, Redis, Resend | `src/lib/stripe.ts`, `src/lib/anthropic.ts` |
| **Auth** | NextAuth.js + PrismaAdapter | `src/lib/auth.ts`, `src/proxy.ts` |
| **Extension** | Chrome Extension MV3 | `extension/` |

---

## 🖥️ FRONT-END — Agent 1 : UI/Design Review

### Problèmes détectés

#### 🚨 Problèmes critiques

1. **Composant | Root layout (`src/app/layout.tsx:15-18`)** — Metadata générique "Create Next App" non modifié
   - **Impact**: SEO, branding
   - **Solution**: Remplacer par les vrais métadonnées TrendHunter

2. **Composant | Page d'accueil racine (`src/app/page.tsx`)** — Page Next.js boilerplate par défaut (logo Next.js, texte "Get started")
   - **Impact**: Le visiteur arrive sur une page par défaut au lieu de la landing
   - **Solution**: Rediriger `src/app/page.tsx` vers la landing ou supprimer et faire de la landing la racine

#### ⚠️ Améliorations importantes

1. **Composant | TrendCard (`src/components/dashboard/trend-card.tsx:70-72`)** — Mapping Badge variant sur score uniquement, pas sur le status métier réel. Un score 75+ = destructive badge, 50-74 = default, < 50 = secondary. Le statut (EMERGING/GROWING/PEAK/FADING) est affiché comme texte mais pas utilisé pour la couleur.
   - **Solution**: Faire correspondre la couleur du badge au statut réel (EMERGING=green, GROWING=yellow, PEAK=red, FADING=gray)

2. **Composant | Sidebar (`src/components/dashboard/sidebar.tsx:16`)** — Props `user` seulement `name` et `image`, mais pas `plan`. Le plan n'est jamais affiché dans la sidebar.
   - **Solution**: Ajouter l'affichage du plan dans le profil utilisateur en bas

3. **UI | Couleurs incohérentes** — Le site utilise `bg-black` et `text-white` pour les boutons principaux, mais l'extension utilise `#2563eb` (blue-600). Pas de design system cohérent entre web et extension.
   - **Solution**: Aligner les couleurs de la marque entre le site et l'extension

#### ✨ Détails de finition (polish)

1. **Input (`src/components/ui/input.tsx`)** — Focus ring en noir (`focus:ring-black`) qui manque de contraste sur fond sombre. | Effort: XS
2. **Badge (`src/components/ui/badge.tsx`)** — Pas de variante pour les statuts de tendance. | Effort: XS
3. **Login page** — Pas de message d'erreur ni de feedback si l'auth Google échoue. | Effort: S
4. **Marketing page** — Année en bas de page codée en dur (2024). | Effort: XS

---

## 🖥️ FRONT-END — Agent 2 : UX Review

#### 🚨 Problèmes critiques

1. **Parcours | Niches page (`src/app/(dashboard)/niches/page.tsx`)** — Les boutons "Suivre" (niche) n'ont **aucun handler** — ils sont purement visuels (pas de `form action` ou de server action)
   - **Impact**: Impossible de suivre une niche
   - **Solution**: Ajouter un Server Action ou un formulaire pour suivre/ne plus suivre une niche

2. **Parcours | Alerts page (`src/app/(dashboard)/alerts/page.tsx`)** — Le bouton "Créer une alerte" n'a pas de handler non plus
   - **Impact**: Impossible de créer une alerte
   - **Solution**: Implémenter le formulaire de création d'alerte

#### ⚠️ Améliorations importantes

1. **UX | NicheSelector (`src/components/dashboard/niche-selector.tsx`)** — Utilise un `<select>` natif comme sélecteur de niche. Pas de chargement d'état, pas de prefetch.
   - **Solution**: Ajouter `useTransition` pour feedback de navigation, précharger les données

2. **UX | TrendCard** — Pas de lien/action pour voir le détail d'une tendance. On ne peut que la voir dans la liste.
   - **Solution**: Ajouter un clic pour voir le détail, les angles de contenu complets, etc.

3. **UX | GenerateTokenButton** — Utilise `alert()` pour feedback utilisateur. Peu professionnel.
   - **Solution**: Remplacer par un toast ou notification inline

#### 🎨 Éléments visuellement discutables

1. **Billing page** — Le token API est affiché en clair dans un `<code>` tronqué avec un bouton "Copier" à côté. Mais le bouton "Copier" est un `<button>` inline sans style d'icône. L'UX de copie est rustique et il n'y a pas de confirmation visuelle de copie réussie.

---

## 🖥️ FRONT-END — Agent 3 : Responsive Review

#### ⚠️ Améliorations importantes

1. **Dashboard layout (`src/app/(dashboard)/layout.tsx:13-19`)** — Layout en `flex h-screen` avec sidebar de 256px. La sidebar n'est pas responsive : elle est toujours visible et prend 256px même sur tablette/mobile.
   - **Solution**: Ajouter une sidebar mobile avec hamburger menu ou drawer

2. **Landing page** — Grille `grid md:grid-cols-4` passe à 1 colonne en mobile, ce qui est correct mais la section features devient très longue.

3. **Pricing page** — `grid md:grid-cols-3` avec `scale-105` sur le plan "populaire". En mobile, les cartes s'empilent mais le scale peut causer des problèmes de layout.

#### ✨ Détails de finition

1. **Taille tactile** — Les liens de navigation dans la sidebar (padding `px-3 py-2`) font environ 40px de hauteur, en dessous du minimum recommandé 44x44px. | Effort: XS

---

## 🖥️ FRONT-END — Agent 4 : Accessibility Review (WCAG 2.1 AA)

#### 🚨 Problèmes critiques

1. **WCAG 1.1.1 | Login page** — Le SVG Google icon n'a pas de `title` ou `aria-label`. L'image utilisateur dans la sidebar (`next/image` avec `alt=""`) est correcte car décorative.
   - **Impact**: Les lecteurs d'écran ne peuvent pas identifier l'icône
   - **Solution**: `<svg aria-label="Google" role="img">` ou `title`

2. **WCAG 4.1.2 | NicheSelector** — Le `<select>` n'a pas de `<label>` associé
   - **Impact**: Les lecteurs d'écran ne savent pas ce que ce champ signifie
   - **Solution**: Ajouter un `<label>` avec `htmlFor`

#### ⚠️ Améliorations importantes

1. **WCAG 1.4.3 | TrendCard score badge** — Texte blanc `text-white` sur badge `bg-red-500` (#ef4444) = ratio contraste ~4.0:1, en dessous de 4.5:1 pour texte normal.
   - **Solution**: Utiliser `bg-red-700` ou texte plus foncé

---

## 🖥️ FRONT-END — Agent 5 : Front-End Architecture Review

#### 🚨 Problèmes critiques

1. **Architecture | Instance Stripe (`src/lib/stripe.ts:4-16`)** — Lazy singleton via Proxy avec mutation de module. Le `getStripe()` modifie `_stripe` mais le Proxy retourne `_stripe ?? getStripe()` — race condition potentielle en cold start. Si Stripe SDK n'est pas chargé en mémoire, `Reflect.get(client, prop, client)` peut échouer silencieusement si `getStripe()` throw.

2. **Architecture | Middleware (`src/proxy.ts`)** — Le fichier s'appelle `proxy.ts` mais fait office de middleware. Next.js 16 utilise `middleware.ts` à la racine. Le matcher exclut les routes API, ce qui signifie que toutes les routes API sont **publiques et non protégées** (sauf vérification manuelle dans chaque route).
   - **Impact**: Routes API accessibles sans auth (même si chaque route vérifie, le pattern est risqué)

#### ⚠️ Améliorations importantes

1. **Composants** — Beaucoup d'asynchrones mélangées : les pages dashboard sont des RSC avec `async`, les components clients utilisent `useState`/`useEffect`. Le découpage est globalement bon mais il manque une couche de chargement (loading.tsx) ou d'erreur (error.tsx)

2. **Gestion d'état** — Aucun état global (React Context, Zustand, etc.). L'état est géré via URL search params et props. Acceptable pour la taille actuelle mais peut devenir limitant.

3. **Ni `loading.tsx` ni `error.tsx`** dans aucune route group. Sur error réseau ou DB, l'utilisateur aura une page blanche ou une erreur React non gérée.

#### ✨ Détails de finition

1. **Sidebar** — Nav items en dur. Si un jour on ajoute des pages, il faut modifier le composant. | Effort: XS

---

## 🖥️ FRONT-END — Agent 6 : Design System Review

#### ⚠️ Améliorations importantes

1. **Tokens** — Pas de tokens de design system. Couleurs codées en dur (classes Tailwind) partout. Le fichier `globals.css` définit `--background` et `--foreground` mais n'est pas utilisé de manière cohérente.

2. **Couleurs** — Pas de palette de marque : la landing utilise `text-blue-600`, l'extension utilise `#2563eb` (blue-600), les boutons sont `bg-black`. Les badges alerts utilisent `bg-amber-50`. Pas de cohérence.

3. **Espacements** — Pas de grille d'espacement cohérente. Parfois `p-4`, parfois `p-6`, parfois `p-8`.

---

## ⚙️ BACK-END — Agent 1 : Architecture Review

#### 🚨 Problèmes critiques

1. **Architecture globale** — Pas de séparation claire entre les couches. Les route handlers API font directement des appels DB (Prisma), de l'auth (NextAuth), et de la logique métier (plan checking) dans le même fichier. Pas de service layer, pas de repository abstraction.

2. **Dépendances circulaires potentielles** — `auth.ts` importe `prisma.ts` pour le callback session. Ensuite `prisma.ts` importe `@prisma/client` qui ne dépend pas de auth, mais la session callback dans auth fait une query Prisma — la logique auth dépend de la DB.

#### ⚠️ Améliorations importantes

1. **Scalabilité de l'architecture** — Architecture monolithique Next.js. Pour la taille actuelle c'est OK, mais le scoring IA est synchrone (attend Claude) ce qui bloque le thread dans les route handlers.

2. **Testabilité** — Aucune abstraction (Repository, Service) — les tests nécessiteraient de mocker Prisma directement ou de setup une DB de test. Pas d'injection de dépendances.

---

## ⚙️ BACK-END — Agent 2 : Code Quality Review

#### 🚨 Problèmes critiques

1. **Stripe webhook (`src/app/api/stripe/webhook/route.ts:6-7`)** — Types custom dangereux (`SubWithPeriod`, `InvoiceWithSub`) avec `as unknown as` casts. Le typage TypeScript est contourné, ce qui peut cacher des erreurs à la compilation qui exploseront en runtime.
   - **Impact**: Rupture silencieuse du webhook Stripe si la structure change
   - **Solution**: Utiliser les types Stripe officiels correctement

2. **Trend scorer (`src/lib/trend-scorer.ts:55-56`)** — `JSON.parse(text)` sans validation. Si Claude retourne du JSON invalide ou du markdown, ça throw une erreur non gérée.
   - **Impact**: Crash de la route API
   - **Solution**: Wrap dans try/catch + validation Zod

#### ⚠️ Améliorations importantes

1. **`plan-check.ts:9`** — `sub.stripeCurrentPeriodEnd < new Date()` devrait être `sub.stripeCurrentPeriodEnd < new Date()` — correct fonctionnellement mais pas de timezone consideration.

2. **Extension trends route** — La route extension/trends n'utilise pas Redis cache contrairement au PLAN.md (qui montre un cache Redis). Le code actuel n'a pas de cache Redis — il va directement en DB à chaque requête.
   - **Note**: Le fichier `redis.ts` n'existe pas dans le code actuel. `@upstash/redis` est dans package.json mais pas utilisé.

3. **Nommage** — `src/proxy.ts` est un middleware, pas un proxy. Nom trompeur.

4. **Magic strings** — `"Extension Chrome"` hardcodé dans `api/extension/auth/route.ts:19` et dans `prisma/schema.prisma:179`.

---

## ⚙️ BACK-END — Agent 3 : Security Review (OWASP Top 10)

#### 🔒 A04:2021 — Insecure Design

1. **API Trends route (`src/app/api/trends/route.ts:23-30`)** — Vérification du nombre de niches suivies pour les users FREE. Logique métier dans la couche API. Si un user FREE supprime toutes ses niches puis appelle l'API, il passe la garde et voit les données.

#### 🔒 A01:2021 — Broken Access Control

2. **Extension auth (`src/app/api/extension/auth/route.ts:12-14`)** — `deleteMany` supprime **tous** les tokens existants avant d'en créer un nouveau. Si le create échoue (DB error), l'user perd tous ses tokens — potentiel lockout.
   - **Risque**: Medium | **Solution**: Faire delete + create dans une transaction

3. **Extension trends (`src/app/api/extension/trends/route.ts:13-14`)** — Le token API est cherché par `findUnique({ where: { token } })`. Le token est un `cuid()` par défaut (faible entropie). `randomUUID()` est utilisé dans la création réelle (bon point), mais le schéma Prisma a `@default(cuid())` pour le champ token.

#### 🔒 A02:2021 — Cryptographic Failures

4. **Anthropic API key (`src/lib/anthropic.ts:4`)** — `process.env.ANTHROPIC_API_KEY!` avec `!` (non-null assertion). Si la variable n'est pas définie, l'erreur sera cryptique (Erreur API Anthropic) plutôt que "Config manquante".

5. **Stripe secret key (`src/lib/stripe.ts:6`)** — Même pattern avec `throw new Error` — meilleur mais toujours pas de validation au démarrage.

#### 🔒 A06:2021 — Vulnerable and Outdated Components

6. **`next-auth@5.0.0-beta.31`** — Version beta en production. Les breaking changes entre betas sont fréquents.

#### ⚠️ Améliorations

7. **Headers de sécurité** — Aucun header de sécurité (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) configuré dans `next.config.ts`.

8. **CORS** — Aucune configuration CORS pour les routes API. L'extension Chrome fait des fetch locaux — en production, le CORS serait un problème si le frontend et l'API sont sur des origines différentes.

#### Résumé Sécurité

| Vulnérabilité | OWASP Ref | Criticité | Solution |
|---|---|---|---|
| Token delete sans transaction | A01 | High | Wrap dans transaction |
| JSON.parse sans validation | A08 | High | Ajouter validation Zod |
| next-auth beta | A06 | Medium | Migrer vers stable |
| Headers sécurité manquants | A05 | Medium | Ajouter dans next.config |
| CORS non configuré | A01 | Medium | Configurer CORS |
| Magic string secret non validé | A02 | Low | Validation au démarrage |

---

## ⚙️ BACK-END — Agent 4 : Performance Review

#### 🚨 Problèmes critiques

1. **Scoring IA synchrone (`src/lib/trend-scorer.ts`)** — L'appel à Anthropic Claude est synchrone dans le route handler. Pour N tendances, N appels séquentiels. Temps typique : 2-5 secondes **par tendance**.
   - **Impact**: Timeout possible sur les routes, mauvaise UX
   - **Solution**: Background job (queue), cache Redis, scoring par lot asynchrone

2. **Dashboard page (`src/app/(dashboard)/dashboard/page.tsx:22-27`)** — Requête DB pour les niches ET les tendances à chaque chargement de page. Si la niche n'existe pas, la requête trends est sautée mais la query niche a déjà eu lieu.
   - **Impact**: 2 requêtes DB minimum par chargement dashboard

#### ⚠️ Améliorations importantes

1. **Cache Redis non implémenté** — `@upstash/redis` est dans `package.json` mais le fichier `src/lib/redis.ts` n'existe pas. Aucun cache n'est utilisé nulle part dans le code actuel (contrairement au PLAN.md qui le montre).

2. **N+1 potentiel** — `trend-card.tsx` ne fait pas de chargement paresseux des `contentAngles`, mais ils sont pré-chargés dans la query. OK actuellement mais à surveiller.

3. **`niches/page.tsx`** — 2 requêtes DB (`findMany` niches + `findMany` userNiches) qui pourraient être fusionnées.

---

## ⚙️ BACK-END — Agent 5 : Database Review

#### 🗄️ Schéma

| Table | Colonne/index | Problème | Recommandation |
|---|---|---|---|
| `Trend` | `score` | `@@index([nicheId, score(sort: Desc)])` — Bon index composite | OK |
| `Trend` | `expiresAt` | Pas d'index sur `expiresAt` utilisé dans les WHERE | Ajouter `@@index([expiresAt])` |
| `User` | `stripeCustomerId` | `String? @unique` — OK pour Stripe | OK |
| `Alert` | `nicheId` | `nicheId String?` — nullable mais pas de `@relation` cohérente | Ajouter relation vers Niche |
| `ApiToken` | `expiresAt` | `DateTime?` mais jamais setté dans le code | Cohérence ou suppression |
| `Niche` | `keywords` | `String[]` — pas de support natif PostgreSQL performant pour les array queries | Table de liaison `NicheKeyword` si scale |

#### ⚠️ Améliorations

1. **`Trend`** — `expiresAt` est un index manquant pour les requêtes `WHERE expiresAt >= NOW()`. Sans index, full table scan à chaque requête.

2. **`Alert`** — Pas d'index sur `userId` pour la recherche des alertes d'un utilisateur.

3. **`Subscription`** — `stripeCurrentPeriodEnd` utilisé dans `plan-check.ts:9` mais pas d'index pour la query par `userId` (déjà unique, donc couvert).

---

## ⚙️ BACK-END — Agent 6 : API Review

#### 🚨 Problèmes critiques

1. **Erreur format** — Pas de format uniforme. Parfois `{ error: "message" }` avec status 4xx, parfois `NextResponse.json({ trends: [], plan })`. Les consumers doivent gérer des formats différents.

2. **Extension trends route** — Si la niche n'existe pas, retourne `{ trends: [], plan }` avec status 200. La route web devrait retourner 404.

3. **Checkout route** — Pas de validation du `priceId` côté serveur. N'importe quel priceId peut être passé, même un qui n'existe pas ou qui n'est pas un abonnement.
   - **Impact**: Un utilisateur pourrait potentiellement passer un priceId invalide ou d'un autre produit
   - **Solution**: Valider priceId contre une liste connue

#### ⚠️ Améliorations importantes

4. **Rate limiting** — Aucun rate limiting sur aucune route API. Les routes extension auth et trends sont particulièrement exposées.

5. **Doc API** — Aucune documentation OpenAPI/Swagger. Pas de types partagés entre le frontend et l'extension.

---

## ⚙️ BACK-END — Agent 7 : Reliability & Observability Review

#### 🚨 Problèmes critiques

1. **Absence totale de logs structurés** — Aucune ligne de `console.log` ou logger dans le code de production. Les seuls logs sont dans `catch` blocks avec `console.error(error)` qui ne donne pas de contexte.

2. **Retry/Timeout** — Aucun timeout sur l'appel Anthropic. Si Claude est lent (rate limit, panne), la route Next.js peut timeout après 30s (Vercel serverless) et l'utilisateur a une erreur 504 sans feedback.

3. **Health checks** — Aucun health check endpoint. Pas de readiness/liveness pour un éventuel déploiement orchestré.

#### ⚠️ Améliorations importantes

4. **Error boundaries** — Pas de `error.tsx` dans les routes groups. Une erreur non gérée dans un RSC = page blanche.

5. **Webhook Stripe** — Pas de retry ou de gestion d'échec. Si le webhook échoue (DB down), Stripe renverra l'event plus tard mais le code ne gère pas les doublons élégamment (upsert sauve la mise).

---

## ⚙️ BACK-END — Agent 8 : Staff Engineer Review

#### 🔮 Risques à long terme

1. **Architecture monolithique Next.js** — Fonctionne pour un MVP mais deviendra problématique à x100 charge :
   - Les background jobs (scoring IA, envoi d'emails, traitement de tendances) ne peuvent pas scale indépendamment
   - Les route handlers API timeout à 30s sur Vercel serverless
   - Pas de séparation read/write (CQRS)

2. **Pas d'abstraction de persistance** — Prisma est appelé directement depuis les route handlers. Migrer de PostgreSQL vers autre chose nécessite de tout réécrire.

3. **Pas de CI/CD** — Aucun fichier de workflow GitHub Actions, pas de tests, pas de lint automatisé en CI (seulement `eslint` script npm).

4. **Gestion des secrets** — `process.env.X!` partout sans validation. Les variables d'environnement ne sont pas vérifiées au démarrage. Un déploiement avec une variable manquante échouera silencieusement à la première requête qui l'utilise.

5. **Extension Chrome** — L'extension hardcode `http://localhost:3000`. En production, ça doit être l'URL de production. Pas de mécanisme de build/déploiement pour l'extension.

#### 💡 Recommandations Staff+ 

- Extraire le scoring IA dans un worker/service séparé (queue + worker)
- Ajouter une validation d'environment au démarrage (toutes les vars requises)
- Créer des fichiers de workflow CI (lint, typecheck, test)
- Remplacer `console.error` par un logger structuré (pino, winston)
- Ajouter des tests (au moins un test d'intégration par route API critique)

---

## 🏢 COUCHE MÉTIER — Agent Business Analyst

#### Problèmes métier

1. **Règle manquante — Limite de niche FREE** — Le `PLAN_LIMITS.FREE.niches = 1`. Mais dans `api/trends/route.ts:23-29`, la vérification est `if (userNiches >= 1)` (strict), ce qui signifie qu'un user FREE avec **0 niche** ne peut pas voir les tendances d'une niche. La limite est mal interprétée : l'utilisateur devrait pouvoir suivre **1 niche** (= créé 1 UserNiche), pas 0.
   - **Impact business**: Les users FREE ne peuvent suivre aucune niche (bloquant)
   - **Correction**: `if (userNiches >= 1)` → `if (userNiches > 1)`

2. **Règle manquante — Suivi de niche non implémenté** — Dans `niches/page.tsx`, le bouton "Suivre" est un `<Button>` sans action. Impossible de suivre une niche.

3. **Règle manquante — Création d'alerte non implémentée** — Dans `alerts/page.tsx`, "Créer une alerte" est un `<Button>` sans handler.

4. **Magic threshold** — Le `Plan.LIMITS.FREE.trendsPerNiche = 5` et la valeur `20` pour PRO sont des magic numbers. Un changement de seuil nécessite une modification du code.

---

## 🏢 COUCHE MÉTIER — Agent Domain Expert (DDD)

#### Problèmes de modèle

1. **Trend.status** — `TrendStatus` enum définit EMERGING/GROWING/PEAK/FADING. Mais le `scoreTrend()` dans `trend-scorer.ts` demande à Claude de retourner ce status. La logique de détermination du statut est déléguée à l'IA, pas codée dans le domaine. Si Claude change son comportement, les statuts deviennent incohérents.

2. **Anemic Domain Model** — Les entités Prisma sont des anémiques (pas de comportement). Toute la logique est dans les services/routes. Par exemple, `getStatusColor` dans `trend-card.tsx` est UI, mais le calcul du statut devrait être une méthode de l'entité Trend.

3. **Value Object manquant** — `ApiToken.token` est un `String`, devrait être un Value Object avec validation (UUID v4). Le schéma a `@default(cuid())` mais le code de création utilise `randomUUID()`. Incohérence.

4. **Ubiquitous Language** — Le code mélange français et anglais :
   - Français : commentaires, messages API, noms de niches
   - Anglais : noms de variables, noms de fonctions, code
   - Cohérent avec le public cible (francophone) mais peut créer de la confusion

---

## 🏢 COUCHE MÉTIER — Agent Use Cases Review

#### Problèmes de cas d'usage

1. **Dashboard page** — Mélange 3 responsabilités : auth check, data fetching, plan validation, rendering. Le `getUserPlan()` est appelé 2 fois (dashboard et plan-check inline).

2. **Checkout session** — Le use case "créer une session checkout" est dans le route handler directement. Il devrait être dans un service.

3. **Token generation** — Le use case "générer token" supprime d'abord tous les tokens existants. Ce side effect n'est pas évident pour l'utilisateur (perd le token actuel).

---

## 💾 COUCHE DATA ACCESS — Agent Repository Review

#### Problèmes

1. **Pattern Repository violé** — Pas de repository layer. Les appels Prisma sont directement dans les route handlers (`prisma.niche.findUnique`, `prisma.trend.findMany`, etc.). Duplication des mêmes patterns de query dans `api/trends/route.ts` et `api/extension/trends/route.ts`.

2. **Requêtes dupliquées** — La query `niche.findUnique({ where: { slug } })` + `trend.findMany({ where: { nicheId } })` est identique dans `dashboard/page.tsx`, `api/trends/route.ts`, et `api/extension/trends/route.ts`.

3. **Pagination absente** — `trend.findMany` sans `skip`/`take` pour les plans PRO (take: 20). Si le nombre de tendances augmente, la page dashboard chargera toujours 20 items sans pagination. Pour un plan PRO, `take: -1` aurait du sens mais `-1` en Prisma = pas de limite. Actuellement `-1` est dans `PLAN_LIMITS` mais pas utilisé comme tel dans les queries.

---

## 💾 COUCHE DATA ACCESS — Agent Query Performance

#### Requêtes problématiques

🟠 **Dashboard page**: 2 queries DB (niche + trends) qui pourraient être parallélisées avec `Promise.all`

🟠 **Niches page**: 2 queries DB (allNiches + userNiches) qui pourraient être combinées

🟢 **Auth session callback**: Query `subscription.findUnique` à chaque session check — ajouté à chaque requête API. Cache manquant.

---

## 💾 COUCHE DATA ACCESS — Agent ORM Review

#### Problèmes ORM

1. **Prisma Client** — `src/lib/prisma.ts:3` — Instance globale sans gestion de hot reload en dev. Next.js 16 avec Webpack/Turbopack peut créer plusieurs instances en dev.

2. **`User` → `Subscription`** — Relation 1:1 avec `@unique` sur `userId`. Mais `Subscription` n'est pas créée pour les users FREE. Le `findUnique` dans `auth.ts` retourne null — géré correctement (`?? "FREE"`).

3. **`Trend.expiresAt`** — Pas de `@updatedAt` ou de trigger pour mettre à jour automatiquement.

---

## 🗄️ COUCHE DATABASE — Agent DBA

#### Problèmes de schéma

| Table | Colonne | Problème | Recommandation SQL |
|---|---|---|---|
| `Trend` | `expiresAt` | Pas d'index | `CREATE INDEX idx_trend_expires ON Trend(expiresAt);` |
| `Trend` | `score` | Int 0-100 mais pas de CHECK | `ALTER TABLE Trend ADD CONSTRAINT chk_score CHECK (score >= 0 AND score <= 100);` |
| `Alert` | `userId` | Pas d'index | `CREATE INDEX idx_alert_user ON Alert(userId);` |
| `Alert` | `nicheId` | String? sans relation | `ALTER TABLE Alert ADD CONSTRAINT fk_alert_niche FOREIGN KEY (nicheId) REFERENCES Niche(id);` |
| `Niche` | `keywords` | String[] (array) | Considérer une table NicheKeyword pour les recherches performantes |
| `User` | `email` | Unique, mais pas de normalize | Ajouter `CHECK (email ~* '^.+@.+\..+$')` |

#### ⚠️ Général

- Les enums `SubscriptionStatus` et `Plan` sont gérés par Prisma. En PostgreSQL, ce sont des types enum — nécessite migration Prisma pour modifier.
- Pas de `createdAt` sur `ApiToken` versionné pour historique de régénération.

---

## 🗄️ COUCHE DATABASE — Agent Database Scalability

#### Risques

| Risque | Impact à x10 | Impact à x100 | Mitigation |
|---|---|---|---|
| Pas d'index sur `expiresAt` | Full scan de 1K lignes | Full scan de 10K+ lignes | Ajouter index |
| `keywords` en array PostgreSQL | Filtrage lent | Très lent | Table de liaison |
| `Trend` table non partitionnée | OK | Problématique (recherche par niche + date) | Partitionnement par niche |
| Pas de read replica | Tout sur le primary | Contention | Read replicas pour les lectures |
| Score trending en temps réel | OK avec cache | Nécessite CDC ou materialized views | Cache Redis + refresh périodique |

---

## 🗄️ COUCHE DATABASE — Agent Data Integrity

#### Risques d'intégrité

1. **`User` → `Subscription`** — Relation 1:1 mais pas de `ON DELETE CASCADE` explicite sur `Subscription.userId`. L'annotation est côté User (onDelete: Cascade).

2. **Race condition** — `api/extension/auth/route.ts:12-21` — Entre le `deleteMany` et le `create`, une autre requête peut créer un token (edge case, faible probabilité mais pas impossible).

3. **Soft delete absent** — Aucune table ne supporte le soft delete. Si un User est supprimé, tous ses tokens et alertes sont cascade-deleted (irréversible).

4. **`updatedAt`** — `@updatedAt` sur User, Subscription, Niche, Trend. Mais pas de garantie que toutes les mutations passent par Prisma (seed, scripts bypassant Prisma).

---

## 🏗️ COUCHE INFRASTRUCTURE — Agent Reliability

#### Points de risque

| Point | Type de panne | Probabilité | Impact | Solution |
|---|---|---|---|---|
| Appel Anthropic synchrone | Timeout / Rate limit | H | High | Queue + timeout + retry |
| Stripe webhook non idempotent | Double traitement | M | Medium | Idempotency key |
| DB unique (pas de replica) | DB down | L | Critical | Read replica + failover |
| Aucun retry sur appels externes | Failure transitoire | H | Medium | Retry avec backoff |
| Aucun circuit breaker | Cascade failure | M | High | Circuit breaker pattern |
| Pas de fallback si API IA down | Scoring impossible | M | High | Fallback sur un modèle plus simple |

---

## 🏗️ COUCHE INFRASTRUCTURE — Agent Security

(Consolidé dans la section Agent 3 — Security Review ci-dessus)

Ajout :
- **Extension Chrome** — Les tokens API sont stockés dans `chrome.storage.local` (non chiffré). Si le poste de l'utilisateur est compromis, le token est accessible.
- **Permissons extension** — `host_permissions` inclut `http://localhost:3000/*`. En production, remplacer par l'URL de production.

---

## 🏗️ COUCHE INFRASTRUCTURE — Agent Observability

#### Zones aveugles

| Zone aveugle | Impact en cas d'incident | Instrumentation recommandée |
|---|---|---|
| Scoring IA | Pas de visibilité sur les ratel limits, timeouts, ou réponses invalides de Claude | Logs structurés + métriques (taux de succès, latence) |
| Stripe webhook | Impossible de savoir si un webhook a échoué sans regarder les logs Stripe | Logger chaque événement + alerte sur échec |
| Auth (NextAuth) | Pas de suivi des échecs de connexion | Logger les tentatives d'auth échouées |
| Performance DB | Pas de métriques sur les temps de requête Prisma | Middleware Prisma pour log les queries lentes |
| Appels API | Pas de monitoring des endpoints | Métriques RED par endpoint |

---

## 🏗️ COUCHE INFRASTRUCTURE — Agent Cloud & Ops

#### Problèmes identifiés

1. **Pas de configuration de déploiement** — Aucun fichier de configuration Vercel/Netlify/Docker. `next.config.ts` est minimal.

2. **Pas de CI/CD** — Aucune pipeline CI/CD. Le projet a des scripts npm mais aucun workflow automatisé.

3. **Docker** — Pas de Dockerfile. Pas de docker-compose pour les services (DB, Redis, MailHog).

4. **Environnements** — Pas de distinction entre dev/staging/prod dans le code. Les scripts de setup (`setup-dev-env.js`, etc.) suggèrent une configuration dev locale.

5. **Variables d'environnement** — Pas de `.env.example` ni de validation des variables requises au démarrage.

6. **Scripts de setup** — ~17 scripts dont beaucoup de shell/Node wrappers. Certains sont en `.ts` (non compilé), d'autres en `.js`. Mélange de conventions.

---

## 🏛️ AGENT FINAL — Architecte — Synthèse

### Top 20 Problèmes

| Rang | Domaine | Problème | Impact | Effort | Source |
|---|---|---|---|---|---|
| 1 | Business | NICHE FOLLOWING NON FONCTIONNEL (bouton sans handler) | Bloquant | S | Business Analyst, UX |
| 2 | Business | ALERT CREATION NON FONCTIONNELLE (bouton sans handler) | Bloquant | S | Business Analyst, UX |
| 3 | Business | Plan FREE bloque 0 niches au lieu de 1 (off-by-one) | Bloquant | XS | Business Analyst |
| 4 | Back-end | Aucun cache Redis (couteau dans package.json, pas de fichier) | Élevé | M | Performance |
| 5 | Back-end | `JSON.parse` sans validation dans trend-scorer | Élevé | XS | Code Quality, Security |
| 6 | Back-end | Stripe webhook: types contournés avec `as unknown as` | Élevé | XS | Code Quality |
| 7 | Back-end | Scoring IA synchrone sans timeout dans route handler | Élevé | M | Performance, Reliability |
| 8 | Back-end | Aucun log structuré (console.error partout) | Élevé | S | Observability |
| 9 | Back-end | Token deleteMany sans transaction (risque de perte) | Medium | XS | Security |
| 10 | Back-end | Trends route: limite FREE mal implémentée | Medium | XS | API, Business |
| 11 | Front-end | Metadata "Create Next App" non changée | Medium | XS | UI/Design |
| 12 | Front-end | Root page boilerplate Next.js affichée | Medium | XS | UI/Design |
| 13 | Front-end | Sidebar non responsive (toujours 256px) | Medium | M | Responsive |
| 14 | Front-end | Pas de loading.tsx / error.tsx dans les routes | Medium | S | UX, Reliability |
| 15 | Database | Index manquant sur `Trend.expiresAt` | Medium | XS | DBA |
| 16 | Database | Pas de contrainte CHECK sur `Trend.score` (0-100) | Medium | XS | DBA |
| 17 | Security | next-auth@5.0.0-beta.31 en production | Medium | M | Security |
| 18 | Security | Headers de sécurité non configurés | Medium | XS | Security |
| 19 | Architecture | Pas de séparation des couches (route = DB + métier) | Medium | XL | Architecture |
| 20 | Infrastructure | Pas de CI/CD, pas de tests, pas de Dockerfile | Medium | L | Cloud & Ops |

### 🧨 Dette technique critique

1. **Extension Chrome hardcode `localhost:3000`** — Ne fonctionnera pas en prod. Coût si ignoré : l'extension est inutilisable en production. Effort: XS
2. **Pas de cache Redis** — `@upstash/redis` dans les dépendances mais jamais utilisé. Coût si ignoré : chaque requête API frappe la DB. Effort: S
3. **Pas de validation d'environnement** — Erreurs silencieuses en déploiement. Coût si ignoré : incidents de production difficiles à diagnostiquer. Effort: S
4. **Pas de tests** — Impossible de refactorer avec confiance. Coût si ignoré : chaque modification peut casser quelque chose. Effort: L

### ⚠️ Risques à 6 mois

1. **Scaling de la DB** — `Trend.expiresAt` sans index + pas de pagination. Avec 50 niches × 20 tendances/jour × 7 jours = 7 000 lignes par semaine. Les full scans deviendront lents.
2. **IA synchrone** — Si le volume de tendances augmente, les route handlers vont timeout sur Vercel (30s max).
3. **Sécurité** — next-auth beta peut contenir des vulnérabilités non patchées ou des breaking changes.

### 🔮 Risques à 2 ans

1. **Architecture monolithique** — Le couplage Next.js (API + frontend) limite la scalabilité indépendante des composants.
2. **Pas d'event sourcing / audit trail** — Impossible de tracer qui a fait quoi (création d'alertes, changements de plan, etc.).
3. **Modèle Prisma exposé partout** — Migration vers un autre ORM ou DB nécessite réécriture massive.

### 📅 Plan d'action priorisé

#### Sprint 1 — Correctifs critiques (semaine 1-2)

| Action | Effort |
|---|---|
| Corriger le bouton "Suivre" dans Niches page (implémenter server action) | S |
| Corriger le bouton "Créer une alerte" (implémenter le formulaire et l'API) | S |
| Corriger l'off-by-one dans la limite FREE (userNiches >= 1 → > 1) | XS |
| Supprimer la page boilerplate `src/app/page.tsx` et rediriger vers landing | XS |
| Remplacer les metadata génériques | XS |
| Changer `localhost:3000` en variable dans l'extension | XS |
| Ajouter validation Zod (ou try/catch) sur le retour de trend-scorer | XS |

#### Sprint 2 — Stabilisation (semaine 3-6)

| Action | Effort |
|---|---|
| Implémenter le cache Redis (`src/lib/redis.ts`) et l'intégrer dans les routes | S |
| Ajouter des logs structurés (pino/winston) à la place de console.error | S |
| Ajouter loading.tsx et error.tsx dans les route groups | S |
| Ajouter un index sur `Trend.expiresAt` | XS |
| Fixer les types Stripe webhook (arrêter `as unknown as`) | S |
| Ajouter validation d'environnement au démarrage | S |

#### Sprint 3 — Amélioration (mois 2-3)

| Action | Effort |
|---|---|
| Ajouter timeouts et retries sur les appels Anthropic | M |
| Rendre la sidebar responsive (mobile drawer) | M |
| Ajouter rate limiting sur les routes API | M |
| Ajouter headers de sécurité (CSP, HSTS) | XS |
| Migrer next-auth de beta vers stable | M |
| Écrire les tests d'intégration pour les routes API critiques | L |

#### Horizon 6 mois — Évolution

| Action | Effort |
|---|---|
| Extraire le scoring IA dans un worker/queue (Bull/BullMQ + Redis) | XL |
| Implémenter un repository pattern pour découpler Prisma | L |
| Ajouter un audit trail (changement de plan, tokens, etc.) | M |
| Mettre en place CI/CD (GitHub Actions) | M |
| Containeriser l'application (Docker + docker-compose) | L |

### Score global

| Domaine | Score |
|---|---|
| Architecture | 4/10 |
| Sécurité | 4/10 |
| Performance | 4/10 |
| Maintenabilité | 5/10 |
| Scalabilité | 3/10 |
| Observabilité | 2/10 |
| **Score global** | **3.7/10** |

### Verdict

Le projet est un MVP fonctionnel avec une base solide (Next.js 16, Prisma, Stripe, Auth, Extension Chrome) mais souffre de nombreux problèmes de jeunesse : 2 features métier critiques ne sont pas implémentées (suivi de niche, création d'alerte), l'infrastructure est absente (pas de cache, pas de logs, pas de CI/CD, pas de conteneurisation), et la sécurité a des lacunes importantes (next-auth beta, pas de validation des entrées, pas de rate limiting). La priorité absolue est de rendre les features existantes réellement fonctionnelles avant d'ajouter de nouvelles capacités. Les 2-3 premiers sprints doivent se concentrer sur la stabilisation et les correctifs bloquants.
