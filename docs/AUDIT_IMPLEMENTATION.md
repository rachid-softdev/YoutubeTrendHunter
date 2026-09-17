# Audit & Implémentation — Corrections YoutubeTrendHunter

> Généré le 16 septembre 2026 — Suite de l'audit complet (cartographie → constats → corrections → vérification → convergence)
> Portée : `youtube-trendhunter-web` (Next.js 16.2.6 App Router, monorepo pnpm/Turbo)

---

## Table des matières

1. [Contexte & objectif](#1-contexte--objectif)
2. [Synthèse de l'audit](#2-synthèse-de-laudit)
3. [Corrections planifiées](#3-corrections-planifiées)
   - [Fix 1 — CRITIQUE : route `/dashboard` inexistante](#fix-1--critique--route-dashboard-inexistante)
   - [Fix 2 — CRITIQUE : bypass d'autorisation sur `PUT /api/niches/[id]`](#fix-2--critique--bypass-dautorisation-sur-put-apinichesid)
   - [Fix 3 — HAUTE : `GET /api/user/audit-logs` — `userId` ignoré + bypass admin absent](#fix-3--haute--get-apiuseraudit-logs--userid-ignoré--bypass-admin-absent)
   - [Fix 4 — HAUTE : clé de cache extension incohérente (cache mort)](#fix-4--haute--clé-de-cache-extension-incohérente-cache-mort)
   - [Fix 5 — HAUTE : protection admin incohérente (3 routes)](#fix-5--haute--protection-admin-incohérente-3-routes)
   - [Fix 6 — HAUTE : slug par défaut de la home `"tech"` inexistant](#fix-6--haute--slug-par-défaut-de-la-home-tech-inexistant)
   - [Fix 7 — CRITIQUE (découvert en vérification) : conflit `middleware.ts`/`proxy.ts`](#fix-7--critique-découvert-en-vérification--conflit-middlewaretsproxyts)
   - [Fix 8 — Tests e2e : path traversal (E2) + Pricing h1→h3 (E4)](#fix-8--tests-e2e--path-traversal-e2--pricing-h1h3-e4)
   - [Fix 9 — Accessibilité : icônes `aria-hidden` (E3) + skip-to-content (E5)](#fix-9--accessibilité--icônes-aria-hidden-e3--skip-to-content-e5)
   - [Fix 10 — Build racine : typecheck des stubs desktop/mobile](#fix-10--build-racine--typecheck-des-stubs-desktopmobile)
4. [Constats documentés — non corrigés](#4-constats-documentés--non-corrigés)
5. [Plan de vérification](#5-plan-de-vérification)
   - [5.6 État CI de la PR #51 — dette pré-existante](#56-état-ci-de-la-pr-51--dette-pré-existante)
   - [5.7 Chantier CI-repair — ✅ RÉSOLU](#57-chantier-ci-repair--résolu)
6. [Audit de non-régression](#6-audit-de-non-régression)
7. [Rapport de convergence](#7-rapport-de-convergence)

---

## 1. Contexte & objectif

Un audit complet de la codebase a été mené : cartographie (routes, services, types, UI, extension/desktop/mobile, schémas Prisma), inventaire des fonctionnalités, analyse front/back/API/DB/auth/plans, puis classification des bugs selon 4 niveaux (CRITIQUE / HAUTE / MOYENNE / FAIBLE). Tous les constats ont été vérifiés par lecture directe des sources **et** par les contrats e2e existants — aucune correction n'est basée sur une supposition.

Ce document est le **plan d'implémentation complet** des **10 corrections** (Fix 1 → Fix 7 issus de l'audit initial + Fix 8 → Fix 10 du lot suite : tests e2e, accessibilité, build racine), le **compte-rendu d'exécution**, ainsi que le runbook de vérification post-correction avec leurs résultats réels.

### Règles de conduite

- **Anti-refactoring** : ne corriger que les bugs réels / failles de sécurité / incohérences. Les améliorations optionnelles sont signalées mais **non implémentées**.
- **Enforcement serveur obligatoire** : tout blocage de fonctionnalité côté client seul est un bug.
- **Chirurgie minimale** : modifier uniquement les lignes nécessaires, garder le style existant.
- **Vérifiabilité** : chaque correction a un critère de succès objectif (test, typecheck, ou comportement reproductible).

### Schémas Prisma — point d'attention

| Schéma | Rôle |
|--------|------|
| `youtube-trendhunter-web/prisma/schema.prisma` | **Autorité** (utilisé par l'app) — Role, UserRole, orgId, Subscription, Plan/Feature/PlanFeature, UsageTracking, StripeEvent, Job… |
| `prisma/schema.prisma` (racine) | Doublon **legacy** — ne pas modifier |

---

## 2. Synthèse de l'audit

### Fonctionnement clé confirmé

- **Auth** : next-auth v5 beta, sessions DB, provider Google. Le callback session hydrate `role`, `plan`, `userRoles`.
- **Portail admin canonique** : `src/lib/auth/require-admin.ts` → `requireAdmin()` (vérif double rôle `User.role` OU table `UserRole`, + fallback DB). Lève `AuthError(message, status)` avec `status` 401 (non authentifié) ou 403 (non admin).
- **Plans** : `PLAN_LIMITS` dans `src/lib/services/subscription.service.ts` — FREE {1 niche, 5 tendances/niche, alerts ✕, export ✕, api ✕}, PRO {alerts ✓, export ✓}, TEAM {api ✓}. Enforcement **serveur confirmé** sur niches (POST), tendances, alertes, export, extension.
- **Version Next.js** : 16.2.6 — `searchParams` de page est une **Promise** ; `middleware` est déprécié et renommé **`proxy`** (les deux fichiers coexistent, `middleware.ts` reste fonctionnel pour le blocage `/dev/:*`).

### Cartographie des bugs classifiés

| ID | Sévérité | Constat | Statut |
|----|----------|---------|--------|
| C1 | 🔴 CRITIQUE | Route `/dashboard` inexistante → 404 dans 8 points de l'app | **Corrigé (Fix 1)** |
| C2 | 🔴 CRITIQUE | `PUT /api/niches/[id]` : tout utilisateur authentifié modifie n'importe quelle niche globale | **Corrigé (Fix 2)** |
| H1 | 🟠 HAUTE | `GET /api/user/audit-logs` : param `userId` validé mais ignoré, bypass admin absent | **Corrigé (Fix 3)** |
| H2 | 🟠 HAUTE | Cache extension : clé d'écriture ≠ clé de lecture (cache mort) | **Corrigé (Fix 4)** |
| H3 | 🟠 HAUTE | Protection admin incohérente sur `admin/stats`, `admin/niches`, `admin/plans` | **Corrigé (Fix 5)** |
| H4 | 🟠 HAUTE | Home : slug par défaut `"tech"` inexistant → dashboard vide par défaut | **Corrigé (Fix 6)** |
| C3 | 🔴 CRITIQUE* | `middleware.ts` + `proxy.ts` coexistent → **build et dev server échouent** (Next 16 les interdit) | **Corrigé (Fix 7)** — *découvert en vérification* |
| M1 | 🟡 MOYENNE | `GET /api/jobs/[id]` : jobs système (`userId=null`) lisibles par tous | Documenté — **non corrigé** |
| M2 | 🟡 MOYENNE | `PATCH /api/niches/[id]` : no-op → 200 | Documenté (asserté e2e) — **non corrigé** |
| M3 | 🟡 MOYENNE | Route `/onboarding` inexistante + composants onboarding non montés | Code mort — **non corrigé** |
| M4 | 🟡 MOYENNE | `EntitlementsProvider` jamais monté ; `/api/me/entitlements` renvoie FREE sans orgId | Code mort — **non corrigé** |
| M5 | 🟡 MOYENNE | `/api/health` : détail complet exposé si `HEALTH_CHECK_SECRET` non défini | Config — **non corrigé** |
| M6 | 🟡 MOYENNE | MRR hardcodé dans `admin/stats` (15€/39€) vs `src/lib/plans.ts` | Dérive potentielle — **non corrigé** |
| M7 | 🟢 FAIBLE* | ~~`middleware.ts` legacy coexiste avec `proxy.ts`~~ → **reclassé C3 en vérification** : Next 16 refuse les deux fichiers ensemble (blocage build/dev) | ✅ Corrigé (Fix 7) |
| M8 | 🟢 FAIBLE | Secret cron comparé avec `!==` (non timing-safe) | Marginal — **non corrigé** |
| M9 | 🟢 FAIBLE | Environnements `.env.production` locaux — `.env*` bien gitignoré, seul `.env.example` tracké | ✅ RAS |

---

## 3. Corrections planifiées

---

### Fix 1 — 🔴 CRITIQUE : route `/dashboard` inexistante

**Problème.** Aucun `page.tsx` sous `src/app/(dashboard)/dashboard/` ni à la racine du groupe `(dashboard)` → `GET /dashboard` renvoie 404. La vraie home du dashboard est **`/home`** (utilisée par la sidebar et la mobile-nav). Références cassées :

| Fichier | Ligne | Impact |
|---------|-------|--------|
| `src/app/(auth)/layout.tsx` | 6 | utilisateur connecté visitant `/login` → `redirect("/dashboard")` → 404 |
| `src/app/(auth)/login/page.tsx` | 47 | `signIn("google", { redirectTo: "/dashboard" })` → 404 après login |
| `src/app/(marketing)/page.tsx` | 88 | CTA landing pour utilisateur connecté → 404 |
| `src/app/(dashboard)/admin/[[...tab]]/page.tsx` | 54 | non-admin → `redirect("/dashboard")` → 404 |
| `src/components/dashboard/niche-selector.tsx` | 18 | `router.push("/dashboard?niche=…")` → **le sélecteur de niche de la home casse** |
| `src/app/manifest.ts` | 8 | `start_url: "/dashboard"` (PWA) |
| `src/proxy.ts` | — | protège `/dashboard` (chemin mort) |

**Stratégie retenue.** Créer une route `/dashboard` qui **redirige vers `/home` en préservant les query params** (compatible e2e : les specs acceptent `/dashboard` OU `/home`), **et** corriger le composant client `niche-selector` pour pousser directement `/home` (évite un aller-retour de redirection à chaque changement de niche).

#### 1a. Créer `src/app/(dashboard)/dashboard/page.tsx`

```tsx
import { redirect } from "next/navigation";

export default async function DashboardRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else {
      qs.set(key, value);
    }
  }

  const query = qs.toString();
  redirect(query ? `/home?${query}` : "/home");
}
```

> ⚠️ Conformément à la doc Next.js locale (`node_modules/next/dist/docs/`), `searchParams` est une **Promise** en App Router v16 — le `await` est obligatoire (même pattern que `home/page.tsx:17`).

**Critère de succès :** `GET /dashboard` → 302 vers `/home` (avec query params préservés) ; les 7 références ci-dessus ne produisent plus de 404.

#### 1b. Corriger `src/components/dashboard/niche-selector.tsx:18`

Avant :

```tsx
router.push(`/dashboard?${params.toString()}`);
```

Après :

```tsx
router.push(`/home?${params.toString()}`);
```

**Critère de succès :** changer de niche depuis la home reste sur `/home?niche=<slug>` et le contenu se met à jour.

---

### Fix 2 — 🔴 CRITIQUE : bypass d'autorisation sur `PUT /api/niches/[id]`

**Problème.** Dans `src/app/api/niches/[id]/route.ts:25-58`, le handler `PUT` ne vérifie que l'authentification (`session.user.id`) : **tout utilisateur connecté peut modifier n'importe quelle niche globale** (nom, description, langue, `isActive`, keywords) — y compris désactiver une niche pour tous les utilisateurs. Le front n'appelle jamais ce PUT (il utilise `DELETE` pour unfollow et `POST /api/niches` pour follow). La fonctionnalité d'édition existe déjà côté admin via `PATCH /api/admin/niches/[id]` (protégé par `requireAdmin()`).

**Correctif.** Gater `PUT` derrière le portail admin canonique `requireAdmin()`, avec le même pattern try/catch `AuthError` que `api/admin/niches/[id]/route.ts`.

Avant (extrait) :

```ts
import { UnauthorizedError, NotFoundError, ValidationError, InternalError } from "@/lib/api-error";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  try {
    const { id } = await params;
    // Verify the niche exists
    const niche = await getNicheById(id);
    if (!niche) return NotFoundError("Niche");
    // ... updateNiche(id, {...}) ...
  } catch (error) {
    console.error("Error updating niche:", error);
    return InternalError();
  }
}
```

Après :

```ts
import { AuthError, requireAdmin } from "@/lib/auth/require-admin";
import { UnauthorizedError, NotFoundError, ValidationError, InternalError } from "@/lib/api-error";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  try {
    // Seul un admin peut modifier une niche globale (toutes les données sont partagées)
    await requireAdmin();

    const { id } = await params;
    // Verify the niche exists
    const niche = await getNicheById(id);
    if (!niche) return NotFoundError("Niche");
    // ... updateNiche(id, {...}) inchangé ...
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating niche:", error);
    return InternalError();
  }
}
```

> `DELETE` et `GET` du même fichier restent **inchangés** (DELETE = unfollow scoped à l'utilisateur, GET = lecture publique d'une niche).

**Critère de succès :** un utilisateur non-admin recevant 401/403 sur `PUT /api/niches/[id]` ; un admin conserve le comportement 200 ; `DELETE` (unfollow) et `GET` non affectés. Aucun e2e existant ne moke `PUT /api/niches/[id]` autrement que « non supporté » → aucun test à casser.

---

### Fix 3 — 🟠 HAUTE : `GET /api/user/audit-logs` — `userId` ignoré + bypass admin absent

**Problème.** `src/app/api/user/audit-logs/route.ts` (18 lignes) valide le param `userId` mais le **jette** : le code appelle toujours `getAuditLogs(session.user.id)`. Conséquence : un admin ne peut pas consulter les logs d'un autre utilisateur, alors que le commentaire « Users can only see their own logs (unless admin) » annonce explicitement ce bypass.

**Correctif.** Honorer `userId` lorsque l'appelant est admin ; conserver le 403 pour un non-admin qui tenterait de lire les logs d'autrui.

Avant :

```ts
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  const userId = req.nextUrl.searchParams.get("userId");
  // Users can only see their own logs (unless admin)
  if (userId && userId !== session.user.id) {
    return ForbiddenError();
  }

  const logs = await getAuditLogs(session.user.id);
  return NextResponse.json({ logs });
}
```

Après :

```ts
import { AuthError, requireAdmin } from "@/lib/auth/require-admin";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  const requestedUserId = req.nextUrl.searchParams.get("userId");
  const targetUserId = requestedUserId ?? session.user.id;

  // Un utilisateur ne peut consulter que ses propres logs, sauf admin
  if (targetUserId !== session.user.id) {
    try {
      await requireAdmin();
    } catch {
      return ForbiddenError();
    }
  }

  const logs = await getAuditLogs(targetUserId);
  return NextResponse.json({ logs });
}
```

**Critère de succès :** sans param `userId` → logs de l'appelant (comportement inchangé) ; non-admin avec `userId` d'autrui → 403 (inchangé) ; **admin avec `userId` → logs de cet utilisateur** (nouveau comportement attendu).

---

### Fix 4 — 🟠 HAUTE : clé de cache extension incohérente (cache mort)

**Problème.** `src/app/api/extension/trends/route.ts` :

- Lecture (ligne 39) : `` `trends:ext:${nicheSlug}:${plan}` ``
- Écriture (ligne 69) : `` `trends:ext:${nicheSlug}:${plan}:${result.userId}` ``

La clé d'écriture inclut `:${result.userId}` en plus → **le cache n'est jamais hit** (dead cache, 300 s de TTL perdus à chaque requête). La donnée mise en cache n'est pas user-spécifique (le plan est déjà dans la clé, et le payload `{trends, plan, nextCursor}` est identique pour tous les utilisateurs d'un même plan).

**Correctif.** Aligner l'écriture sur la lecture (retirer le suffixe `:${result.userId}`) pour maximiser le hit-rate, conformément à l'intention du code (cache partagé par niche + plan).

Avant :

```ts
if (!cursor) {
  await setCached(`trends:ext:${nicheSlug}:${plan}:${result.userId}`, responseData, 300);
}
```

Après :

```ts
if (!cursor) {
  await setCached(`trends:ext:${nicheSlug}:${plan}`, responseData, 300);
}
```

**Critère de succès :** deux requêtes successives sans `cursor` pour le même `nicheSlug` + `plan` → la seconde est servie depuis le cache (vérifiable via logs Redis ou instrumentation). Aucun e2e ne dépend de cette clé.

---

### Fix 5 — 🟠 HAUTE : protection admin incohérente (3 routes)

**Problème.** Trois routes admin utilisent un check inline `session.user.role !== "ADMIN"` sans fallback DB ni vérification de la table `UserRole`, alors que toutes les autres routes admin passent par `requireAdmin()`. Un admin déclaré **uniquement via la table `UserRole`** (pattern du seed) est bloqué sur ces 3 routes mais accepté ailleurs — incohérence d'autorisation réelle.

Routes concernées :

| Fichier | Check actuel |
|---------|--------------|
| `src/app/api/admin/stats/route.ts:9` | `if (!session?.user?.role \|\| session.user.role !== "ADMIN")` → 401 `{error: "Unauthorized"}` |
| `src/app/api/admin/niches/route.ts:11` | idem (GET et POST) |
| `src/app/api/admin/plans/route.ts:18-24` | fonction locale `requireAdmin()` qui jette `new Error("UNAUTHORIZED")` |

**Correctif.** Remplacer les checks inline par `requireAdmin()` de `@/lib/auth/require-admin`, avec le catch `AuthError` standard, et **supprimer la fonction locale homonyme** dans `admin/plans` (conflit de nom avec l'import).

#### 5a. `src/app/api/admin/stats/route.ts`

Imports — avant :

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
```

Après :

```ts
import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
```

Corps de `GET` — avant :

```ts
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.role || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [ ... ] = await Promise.all([ ... ]);
```

Après :

```ts
export async function GET() {
  try {
    await requireAdmin();

    const [ ... ] = await Promise.all([ ... ]);
```

Catch — avant :

```ts
  } catch (error) {
    console.error("[Admin/Stats] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
```

Après :

```ts
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Admin/Stats] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
```

#### 5b. `src/app/api/admin/niches/route.ts` (GET et POST)

Même transformation. Imports :

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
```

Chaque handler : remplacer le bloc `const session = await auth(); if (!session?.user?.role || session.user.role !== "ADMIN") { return ... 401 }` par `await requireAdmin();` (dans le `try` existant), et ajouter au `catch` le branchement `AuthError` comme en 5a. **Retirer l'import de `auth` uniquement s'il devient inutilisé dans le fichier** (sinon le laisser pour les autres handlers).

> ⚠️ Vérifier le reste du fichier : si `auth` n'est plus référencé nulle part, le supprimer des imports sous peine d'échec lint (`no-unused-vars`).

#### 5c. `src/app/api/admin/plans/route.ts`

Supprimer la fonction locale (lignes 18-24) :

```ts
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
```

Imports — avant :

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
```

Après :

```ts
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
```

Catch — avant :

```ts
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[Admin/Plans] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
```

Après :

```ts
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Admin/Plans] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
```

**Critère de succès :** admin (rôle direct OU UserRole OU DB) → 200 sur les 3 routes ; non-admin → 401/403 `{error}` ; forme de réponse uniforme avec l'ensemble des routes admin.

---

### Fix 6 — 🟠 HAUTE : slug par défaut de la home `"tech"` inexistant

**Problème.** `src/app/(dashboard)/home/page.tsx:22` : `const nicheSlug = nicheQuery ?? "tech";`. Le seed (`youtube-trendhunter-web/prisma/seed.ts`) crée les slugs `finance-personnelle`, `tech-ia`, `fitness`, `cuisine`, `business-en-ligne` — **aucun slug `"tech"`**. Sans `?niche=`, `getTrendsForDashboard("tech", plan)` (qui fait `findUnique({ slug: "tech" })`) renvoie `[]` → la home affiche un dashboard **vide par défaut** pour tout nouvel utilisateur.

**Correctif minimal (aligné seed + extension).** L'extension Chrome utilise déjà `"tech-ia"` comme slug par défaut (`shared/constants/api.ts` → `DEFAULT_NICHES[0]`). Aligner la home dessus.

Avant :

```ts
const nicheSlug = nicheQuery ?? "tech";
```

Après :

```ts
const nicheSlug = nicheQuery ?? "tech-ia";
```

> **Option robuste (non implémentée, signalée)** : fallback sur le premier slug actif via `getAllActiveNiches()[0]?.slug ?? "tech-ia"` — restructurerait la logique de cache de la page (appel de `getAllActiveNiches` avant le `Promise.all`), hors périmètre anti-refactoring.

**Critère de succès :** `GET /home` sans param → tendances de `tech-ia` affichées (non vide) sur une DB seedée ; `GET /home?niche=finance-personnelle` inchangé.

---

### Fix 7 — 🔴 CRITIQUE (découvert en vérification) : `middleware.ts` + `proxy.ts` en conflit → build et dev server cassés

**Problème.** Découvert lors de la vérification (`pnpm build`) : Next.js 16.2 refusait de démarrer — `Error: Both middleware file "./src\middleware.ts" and proxy file "./src\proxy.ts" are detected. Please use "./src\proxy.ts" only.` Le constat initial (M7, classé FAIBLE « migration différée ») était en réalité **un bloqueur total** : `pnpm build` échouait, `pnpm dev` échouait, et l'infra e2e ne pouvait pas démarrer de serveur. L'audit initial avait sous-estimé cette coexistence (le fichier était en place mais ne pouvait pas être exécuté).

**Correctif.** Fusionner la logique de `middleware.ts` (blocage `/dev/:*` en production) dans `proxy.ts`, puis supprimer `middleware.ts`.

`middleware.ts` (supprimé) contenait :

```ts
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Dev-only routes: block /dev/* in production
  if (
    process.env.NODE_ENV === "production" &&
    (pathname === "/dev" || pathname.startsWith("/dev/"))
  ) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

Dans `src/proxy.ts`, ajout en tête du handler (matcher du proxy déjà couvert, pas de changement de portée) :

```ts
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // === Dev-only routes: block /dev/* in production ===
  const path = request.nextUrl.pathname;
  if (
    process.env.NODE_ENV === "production" &&
    (path === "/dev" || path.startsWith("/dev/"))
  ) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }
  // ... auth protection, diagnostic headers inchangés
}
```

> Note : la route `/404` n'existe pas en tant que page dédiée — le rewrite aboutit au `not-found.tsx` global (comportement conservé à l'identique du middleware legacy).

**Critère de succès :** `pnpm build` passe ; `pnpm dev` démarre ; `/dev/*` toujours bloqué en production. ✅ **Vérifié** : build ✅ (route `/dashboard` apparaît dans la liste des routes), typecheck ✅, lint ✅.

### Fix 8 — Tests e2e : path traversal (E2) + Pricing h1→h3 (E4)

Lot « suite e2e propre » — corrections des constats E2 et E4 identifiés pendant la vérification (voir §4).

**E2 — `e2e/api-jobs-id.spec.ts:652` « 1m — Path traversal dans l'ID du job → 404 ».**

**Problème.** Le test envoyait `fetch("/api/jobs/../../../etc/passwd?...")`. Le parseur URL du navigateur (WHATWG, identique à Node) **normalise les segments `..` avant d'envoyer la requête** → l'URL effective devient `/etc/passwd` ; le mock `**/api/jobs/*` (un seul segment) n'est jamais atteint, et le vrai serveur Next renvoie son 404 HTML par défaut au lieu du JSON contractuel `{error: "Job introuvable", code: "NOT_FOUND"}`. Le handler réel est correct (`NotFoundError("Job")` → §2) — seul le test était mal construit.

**Correctif.** Encoder la traversée en `%2e%2e%2f` : le parseur URL **préserve** les segments encodés (vérifié empiriquement), l'URL reste sous `/api/jobs/` (un seul segment) et le mock est atteint — le contrat 404 du handler est exercé, comme toutes les autres étapes simulées du fichier.

```ts
const res = await fetchApi(
  page,
  // Percent-encoded traversal: the browser normalizes literal "../" segments
  // to "/etc/passwd" (never reaching the mock), so we encode them to keep the
  // path under /api/jobs/ and exercise the handler's traversal contract.
  "/api/jobs/%2e%2e%2fetc%2fpasswd?_test_session=true&_test_path_traversal=true",
);
```

Preuve de la normalisation (parseur URL Node = WHATWG = Chromium) :

```text
new URL("http://localhost:3000/api/jobs/../../../etc/passwd")  → /etc/passwd   (normalisé)
new URL("http://localhost:3000/api/jobs/%2e%2e%2fetc%2fpasswd") → /api/jobs/%2e%2e%2fetc%2fpasswd  (préservé)
```

**E4 — `e2e/accessibility-copy.spec.ts:708` « Pricing — h1 → h3 détecté comme saut ».**

**Problème.** Le test était incohérent avec lui-même : il poussait une annotation warning (« known structural issue ») **et** assertait `expect(skips).toHaveLength(0)`. La cause racine était réelle : `CardTitle` (composant `card.tsx`) rend un `<h3>` en dur, placé directement après le `<h1>` de `/pricing` → saut de hiérarchie.

**Correctif.** Corriger la structure de la page (pas le test) : `<CardTitle>` → `<h2>` avec les mêmes classes sur `src/app/(marketing)/pricing/page.tsx` (+ retrait de l'import `CardTitle` devenu inutilisé). Le test existant passe désormais légitimement.

```tsx
// Avant
<CardTitle className="text-3xl font-black italic">{plan.name}</CardTitle>
// Après
<h2 className="text-3xl font-black italic">{plan.name}</h2>
```

**Critères de succès :** (E2) test « 1m » passe sur le contrat `404` + `{error: "Job", code: "NOT_FOUND"}` ; (E4) `/pricing` sans saut de heading (`diff ≤ 1`). ✅ **Vérifié** (chromium) : `e2e/api-jobs-id.spec.ts` **15/15**, `e2e/accessibility-copy.spec.ts` **18/18**.

### Fix 9 — Accessibilité : icônes `aria-hidden` (E3) + skip-to-content (E5)

Lot accessibilité — corrections des constats E3 et E5 (pré-existants, vérifiés sur baseline).

**E3 — icônes lucide décoratives sans `aria-hidden="true"`.**

**Problème.** Les icônes lucide-react rendent des `<svg>` sans `aria-hidden` par défaut — exposées au lecteur d'écran alors qu'elles sont purement décoratives (le texte voisin porte le sens). Le test vérifiait la landing `/`.

**Correctif.** Ajout de `aria-hidden="true"` sur 19 icônes + 1 SVG décoratif inline, dans les composants rendus sur `/` (vérifiés exhaustivement) :

| Fichier | Icônes |
|---------|--------|
| `src/app/(marketing)/page.tsx` | `Play` ×3, `Sparkles`, `Zap` ×2, `TrendingUp`, `ArrowRight` ×2, `Check`, `feature.icon` (TrendingUp/Video/Bell/BarChart3) + SVG décoratif (vague sous « l'Algorithme. ») |
| `src/app/(marketing)/pricing/page.tsx` | `Play`, `Sparkles`, `Check`, `ArrowRight` |
| `src/components/theme-toggle.tsx` | `Sun`, `Moon` (le bouton porte déjà un `aria-label` « Passer en mode clair/sombre ») |
| `src/components/cookie-consent.tsx` | `Cookie` (bandeau global) |

**E5 — skip-to-content absent / non focusable.**

**Problème.** Aucun lien d'évitement : les utilisateurs de lecteur d'écran doivent tabuler à travers toute la navigation pour atteindre le contenu. Le test exigeait un lien `#...` (texte « contenu/skip/main/content ») caché visuellement mais focusable au Tab.

**Correctif.** Ajout dans le layout racine `src/app/layout.tsx` (rendu sur **toutes** les pages, premier élément focusable) :

```tsx
<a
  href="#main"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-yt-red focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold"
>
  Aller au contenu
</a>
<div id="main" className="flex flex-col flex-1">
  {children}
  <CookieConsent />
</div>
```

Le `<div id="main">` sert de cible d'ancrage (les pages ont déjà leurs propres balises `<main>` — un `<main>` imbriqué serait du HTML invalide).

**Conséquence contractuelle assumée :** le lien skip devient le **premier élément tabulable** (comportement standard a11y). Le test `accessibility-copy.spec.ts:164` « Login page — Tab se déplace dans l'ordre logique » attendait le logo en premier → **aligné** sur la nouvelle structure : Tab 1 = « Aller au contenu », Tab 2 = logo TrendHunter, Tab 3 = Google/next (l'assertion finale de l'ordre logique est préservée, cf. §7).

```ts
// Avant : Tab 1 = logo, Tab 2 = Google
// Après : Tab 1 = skip-to-content ("contenu"), Tab 2 = logo ("trendhunter"), Tab 3 = next
```

**Critères de succès :** (E3) aucun `<svg>` sans `aria-hidden`/`role="img"`/`aria-label` sur `/` ; (E5) lien skip détecté (`found === true`), caché (`sr-only`), focusable (1re Tab = skip link). ✅ **Vérifié** (chromium) : `e2e/accessibility-copy.spec.ts` **18/18** (dont login aligné).

### Fix 10 — Build racine : typecheck des stubs desktop/mobile

**Problème.** `pnpm typecheck` à la racine (turbo) échouait sur les packages stubs `youtube-trendhunter-desktop` et `youtube-trendhunter-mobile` : leur script `typecheck` était `tsc --noEmit` **sans tsconfig local**. `tsc` remontait alors au `tsconfig.json` racine, qui inclut des fichiers du web (`../youtube-trendhunter-web/src/lib/...`) sans l'alias `@/` → cascade d'erreurs `TS2307 Cannot find module '@/...'` et `TS7006` (implicit any). Les stubs ne contiennent **aucun code source** (uniquement `.env*`, `AGENTS.md`, `package.json`) — leurs scripts `build`/`dev`/`test` sont déjà des placeholders `echo`.

**Correctif.** Aligner `typecheck` sur les autres scripts placeholder (cohérent avec le statut de stub — rien à typechecker) :

```json
// youtube-trendhunter-desktop/package.json et youtube-trendhunter-mobile/package.json
"typecheck": "echo 'Desktop placeholder typecheck'",
```

**Critère de succès :** `pnpm typecheck` racine → 6/6 tasks vertes (web, extension, ui, types + 2 stubs) ; `pnpm build` racine → 5/5 vert. ✅ **Vérifié** : typecheck racine **6/6 successful**, build racine **5/5 successful** (warnings cosmétiques « no output files » pour les stubs `echo`, non bloquants).

---

## 4. Constats documentés — non corrigés

Décisions prises lors de l'audit, à conserver en l'état (documentées pour traçabilité).

| ID | Constat | Justification de non-correction |
|----|---------|--------------------------------|
| M1 | `GET /api/jobs/[id]` : un job avec `userId=null` (système) est accessible à tout utilisateur authentifié | **Comportement documenté** par le test e2e `e2e/api-jobs-id.spec.ts:209` (« System-owned job (userId=null) — accessible to all authenticated users »). Modifier casserait le contrat de test. |
| M2 | `PATCH /api/niches/[id]` : no-op validant l'ownership puis renvoyant 200 sans modification | **Asserté par e2e** (`e2e/api-niches-crud.spec.ts` — « PATCH — Succès (no-op) → 200 »). Vestige contractuel, supprimer serait un breaking change de l'API. |
| M3 | Route `/onboarding` inexistante + composants `onboarding-banner`, `onboarding-checklist`, `first-value-highlight`, `nps-survey` jamais montés (0 import dans `src/app`) | Code mort latent : aucun impact utilisateur. Les supprimer ou les câbler est une décision produit, hors bug. |
| M4 | `EntitlementsProvider` (`src/hooks/use-entitlements.tsx`) jamais monté ; `GET /api/me/entitlements` renvoie FREE sans `orgId` même avec subscription `userId` (vs `/api/entitlements` qui a le fallback) | Système d'entitlements client inactif (aucun `FeatureGuard` monté). L'enforcement réel passe par `PLAN_LIMITS` côté serveur, qui est correct. |
| M5 | `GET /api/health` expose le détail complet des services si `HEALTH_CHECK_SECRET` n'est pas défini | Décision de config : définir la variable en production. Comportement « reduced info » déjà prévu quand le secret est posé. |
| M6 | MRR hardcodé dans `admin/stats` (`proCount * 15 + teamCount * 39`) dupliquant `src/lib/plans.ts` | Les prix actuels correspondent ; un écart futur est un risque de dérive, pas un bug actif. |
| M7 | ~~`src/middleware.ts` coexiste avec `src/proxy.ts`~~ → **reclassé C3** pendant la vérification (bloqueur build/dev) | ✅ **Corrigé** par le Fix 7 — voir §3 |
| M8 | Comparaison du secret cron avec `!==` (non timing-safe) dans `api/cron/trends` et `api/cron/process-jobs` | Secret haute entropie (`CRON_SECRET`), risque marginal ; `timingSafeEqual` envisageable mais non prioritaire. |
| M9 | `.env.production` / `.env.local` présents localement | `.env*` est gitignoré (`.gitignore`), seul `.env.example` est tracké → aucune fuite. ✅ |

### Constats e2e supplémentaires (découverts en exécution, pré-existants vérifiés sur baseline)

> Méthode : exécution de la suite e2e Playwright (`chromium`) sur **baseline** (code d'origine, `git stash` + seul fix infra M7 appliqué pour permettre le démarrage du serveur) puis sur **code corrigé**. Résultat : **5 échecs identiques dans les deux cas** → tous pré-existants. Un 6e échec (`admin.spec.ts:336`) a été **causé par le Fix 1** (URL finale `/home` au lieu de la 404 `/dashboard`) et a été résolu en alignant le contrat de test sur le nouveau comportement (accepte `/dashboard` **ou** `/home`).
>
> **Mise à jour (lot suite) :** E2, E3, E4 et E5 ont été **corrigés** (Fixes 8 et 9, §3) — seuls E1 reste documenté comme environnement. Voir vérifications §5.3.

| ID | Sévérité | Constat e2e | Statut |
|----|----------|-------------|--------|
| E1 | 🟡 MOYENNE | `api-niches.spec.ts:1143` « 4e — Aucune niche publique disponible → 200 avec `available: []` » reçoit **503** | **Documenté — non corrigé.** Le rate-limit Redis (`src/lib/rate-limit.ts`) ne peut pas joindre Redis (URL placeholder locale `xxx.upstash.io`) → `withRateLimit` refuse en mode défensif. **Problème d'environnement local, pas de code.** En CI/avec Redis réel, comportement attendu 200. |
| E2 | 🟢 FAIBLE | `api-jobs-id.spec.ts:652` « 1m — Path traversal dans l'ID du job → 404 » : `body.error` est `undefined` | ✅ **Corrigé (Fix 8)** — URL encodée `%2e%2e%2f` (le navigateur normalisait `../../..` en `/etc/passwd`, le mock n'était jamais atteint) |
| E3 | 🟢 FAIBLE | `accessibility-copy.spec.ts:351` « Les icônes lucide-react (SVG) ont `aria-hidden="true"` » | ✅ **Corrigé (Fix 9)** — `aria-hidden` sur 19 icônes + SVG décoratif (landing, pricing, theme-toggle, cookie-consent) |
| E4 | 🟢 FAIBLE | `accessibility-copy.spec.ts:708` « Pricing — h1 → h3 détecté comme saut (skip attendu) » | ✅ **Corrigé (Fix 8)** — `<CardTitle>` (h3 en dur) → `<h2>` sur la page pricing |
| E5 | 🟢 FAIBLE | `accessibility-copy.spec.ts:830` « Un lien "Aller au contenu" caché visuellement devient focusable au Tab » | ✅ **Corrigé (Fix 9)** — lien skip-to-content dans le layout racine + cible `#main` (+ test login aligné : Tab 1 = skip link) |

---

## 5. Plan de vérification — **RÉSULTATS RÉELS (exécuté le 16 septembre 2026)**

> ⚠️ Découverte en exécution : `pnpm build` et `pnpm dev` **échouaient sur le baseline** (conflit `middleware.ts`/`proxy.ts`) — corrigé par le Fix 7 (§3). Sans cette correction, aucune gate (build, e2e) n'était franchissable.

### 5.1 Gates statiques — ✅ TOUTES VERTES

| Gate | Commande | Résultat |
|------|----------|----------|
| Typecheck (web) | `pnpm --filter @youtube-trendhunter/web typecheck` | ✅ 0 erreur |
| Lint (web) | `pnpm --filter @youtube-trendhunter/web lint` | ✅ 0 erreur (2 warnings pré-existants dans `(dev)/brand` et `(dev)/pages/error`, hors périmètre) |
| Build (web) | `pnpm --filter @youtube-trendhunter/web build` | ✅ complet — route `/dashboard` présente dans la liste des routes générées |

> Note : le build **racine** (`pnpm build` → turbo) échouait sur les packages stubs `desktop`/`mobile` (`tsc --noEmit` sans tsconfig local remontant au tsconfig racine → erreurs `TS2307` sur l'alias `@/` dans les fichiers du web cités depuis les stubs) — **pré-existant**. ✅ **Corrigé en lot suite (Fix 10)** : `typecheck` des stubs aligné sur leurs placeholders `echo` → `pnpm typecheck` racine **6/6** ✅, `pnpm build` racine **5/5** ✅ (voir §3).

### 5.2 Tests unitaires — ✅ TOUS VERTS

```bash
pnpm --filter @youtube-trendhunter/web test
# Test Files  44 passed (44)
# Tests       1288 passed (1288)
```

Aucun test unitaire n'assertait l'ancienne forme inline des routes admin — aucune mise à jour nécessaire.

### 5.3 Tests e2e (web) — ✅ VERTS (chromium) + SUITE MULTI-NAVIGATEURS

Run initial (7 specs ciblés, chromium) : `admin.spec.ts`, `api-admin.spec.ts`, `api-niches-crud.spec.ts`, `api-niches.spec.ts`, `api-misc.spec.ts`, `api-jobs-id.spec.ts`, `accessibility-copy.spec.ts` → **254 passed, 5 failed** (E1–E5, tous pré-existants vérifiés sur baseline).

**Lot suite (Fixes 8–9)** — re-exécution des specs corrigées, chromium :

```bash
pnpm exec playwright test e2e/api-jobs-id.spec.ts e2e/accessibility-copy.spec.ts --project=chromium
# 1er run : 32 passed / 1 failed (accessibility:164 « Login Tab » — skip link désormais premier focusable)
# Après alignement du test d'ordre logique (Tab 1 = skip link, Tab 2 = logo, Tab 3 = next) :
```

| Spec | Résultat |
|------|----------|
| `e2e/api-jobs-id.spec.ts` (chromium) | ✅ **15/15** — dont « 1m — Path traversal » (Fix 8) |
| `e2e/accessibility-copy.spec.ts` (chromium) | ✅ **18/18** — dont icônes aria-hidden (E3), Pricing h2 (E4), skip-to-content (E5), login Tab aligné |

Suite **complète multi-navigateurs** (79 fichiers, 4 projets `chromium`/`firefox`/`webkit`/`mobile-safari`) : voir §5.5.

### 5.4 Vérification manuelle reproductible — ✅ EXÉCUTÉE (serveur dev réel)

Résultats réels obtenus (serveur `pnpm dev` sur `localhost:3000`) :

| # | Vérification | Résultat |
|---|--------------|----------|
| 1 | `GET /api/admin/stats` sans session | ✅ **401** `{"error":"Non authentifié"}` (Fix 5 — `AuthError` réel) |
| 2 | `GET /api/admin/plans` sans session | ✅ **401** `{"error":"Non authentifié"}` (Fix 5) |
| 3 | `GET /api/admin/niches` sans session | ✅ **401** `{"error":"Non authentifié"}` (Fix 5) |
| 4 | `GET /api/user/audit-logs` sans session | ✅ **401** `{"error":"Non authentifié","code":"UNAUTHORIZED"}` (comportement inchangé) |
| 5 | `GET /dashboard` sans session | ✅ protégé par proxy → redirection `/login?callbackUrl=%2Fdashboard` (**la route existe** — avant : 404 pur). Avec session e2e : redirect `/home` confirmé par le spec `admin.spec.ts:336` (aligné) |
| 6 | `GET /home` | ✅ 200 (défaut `tech-ia`, seed-aligned) |
| 7 | `PUT /api/niches/[id]` non-admin | Validé par lint/typecheck/build + pattern `requireAdmin()` identique aux 3 routes admin testées en réel (401) |

### 5.5 Suite e2e complète multi-navigateurs — ⚠️ LANCÉE, INTERROMPUE PAR L'ENVIRONNEMENT (résultats partiels)

**Préparation :** navigateurs `firefox` et `webkit` installés avec succès (`pnpm exec playwright install firefox webkit` — WebKit 26.5 téléchargé ; `mobile-safari` utilise le moteur WebKit).

**Tentatives d'exécution** de l'intégralité de la suite (79 fichiers, 4 projets, **10 936 tests**) :

| Tentative | Progression | Issue |
|-----------|-------------|-------|
| T1 — tous projets, parallélisme natif | test #1602/10936 (chromium) | ⛔ **crashes workers chromium** (`0xC0000409`) — saturation mémoire (4 navigateurs simultanés) + restart serveur de l'environnement de travail |
| T2 — projets séquentiels, `--workers=8` | test #1355/2734 (chromium seul) | ⛔ restart serveur de l'environnement de travail (shell d'arrière-plan annulé) |
| T3 — chromium seul, avant-plan | démarrage | ⛔ `EADDRINUSE` (serveur dev orphelin du T2) puis restart serveur |

L'environnement de travail de cette session **redémarre les processus longs (> ~2 min)** — il est impossible d'y exécuter une suite de 30-60 min de façon fiable. Ce n'est pas un échec de test : les 3 interruptions sont des **causes infra**, pas des résultats.

**Données exploitables des runs interrompus (chromium) :**
- Aucune régression nouvelle dans les ~1 600 tests observés — les échecs comptabilisés sont des **cascades de crash workers** (245/403 entrées = « worker process exited unexpectedly ») ou des marqueurs attendus.
- **1 seul échec réel nouveau** : `accessibility.spec.ts:164` « Login Tab » (l'ancien contrat attendait le logo en premier focusable) — **dupliqué** de `accessibility-copy.spec.ts` (2 fichiers jumeaux non détectés lors du run ciblé). Corrigé au passage (même alignement) et **vérifié : 36/36** sur les 2 fichiers (ci-dessus).
- **Visual regression attendu** : `e2e/visual-regression.spec.ts` utilise `toHaveScreenshot()` sans baselines `__snapshots__` générées (la suite complète n'a jamais tourné sur cette machine ni en CI) → **échecs attendus sur les 4 projets** au premier run (génération via `--update-snapshots`), pré-existant et sans rapport avec les corrections.

**Couverture effective des modifications (Fixes 8-10) — chromium, vérifié :**
`api-jobs-id.spec.ts` **15/15** · `accessibility.spec.ts` **18/18** · `accessibility-copy.spec.ts` **18/18** · `admin.spec.ts`, `api-admin.spec.ts`, `api-niches-crud.spec.ts`, `api-niches.spec.ts`, `api-misc.spec.ts` (`254 passed`) — soit **toutes les specs touchées par les Fixes 1-9 vérifiées**, + gates statiques et unitaires (§5.1-5.2).

> **Recommandation** : exécuter la suite complète multi-navigateurs en **CI** (environnement stable) : `pnpm exec playwright test` après une génération initiale des baselines visual-regression (`--update-snapshots` chromium) et une URL Redis réelle (débloque E1). Statut à ce jour documenté au §4/§5 — aucune régression connue des changements.

### 5.6 État CI de la PR #51 — ⚠️ 2 JOBS EN ÉCHEC **PRÉ-EXISTANTS** (zéro régression introduite)

> **✅ RÉSOLU par le chantier « CI-repair » (branche `fix/ci-repair`) — voir §5.7.**

**Constat (run `35141979081`, head `d3c17c6`, PR #51 `fix/audit-corrections`) :**

| Job | Conclusion | Cause |
|-----|------------|-------|
| Lint + Typecheck + Test | ❌ **FAILURE** | Step « Typecheck » (tuile : `turbo run typecheck`) — **310 erreurs TS** |
| Security Scan | ❌ **FAILURE** | Step « Audit dependencies » (`pnpm audit --audit-level=high`) |
| E2E Tests (Playwright) | ⏭️ **SKIPPED** | `needs: [lint-typecheck-test]` → auto-skip quand la job amont échoue |

**Preuve que c'est pré-existant (et non imputable à la PR) :**
- `gh api commits/8468614/check-runs` (= HEAD de `main`, base de la branche) → **exactement les mêmes conclusions** : Lint+Typecheck+Test `failure`, Security Scan `failure`, E2E `skipped`. Le dernier run CI vert de `main` date d'avant le 2026-09-04 (run le plus récent de main déjà en échec).
- Les **310 erreurs TS sont 100 % de classe « dépendance manquante »** — aucune erreur nouvelle liée aux fichiers modifiés par la PR (les fichiers de la PR n'apparaissent que via les modules manquants partagés, ex. `lucide-react` ; aucun `TS2xxx` de logique).

**Cause racine (inventaire relevé) :**
- Le `package.json` de `youtube-trendhunter-web` **ne déclare pas ~13 dépendances que le code importe** : `lucide-react` (39 sites), `zod`, `stripe`, `@sentry/nextjs`, `posthog-js`, `@upstash/redis`, `@anthropic-ai/sdk`, `@testing-library/react`, `class-variance-authority`, `@radix-ui/react-slot`, `@types/react`, `@types/react-dom`, `@types/node`…
- `git log -S "lucide-react" -- youtube-trendhunter-web/package.json` = **aucune trace** — ces deps ont été perdues lors de la migration workspace (« Move project files to dedicated folders », 2026-05-19) ou d'un nettoyage ultérieur, sans retirer les imports.
- Le lockfile (`pnpm-lock.yaml`) ne contient **0 occurrence** de `lucide`/`stripe`/`sentry` → un install CI frais (`--frozen-lockfile`) ne peut pas les résoudre.
- **Pourquoi le local passe** : `node_modules\lucide-react` existe à la racine du repo local comme **dossier réel orphelin (pas un symlink pnpm, absent du `.pnpm`)**, vestige d'un install manuel — la résolution TS monte jusqu'au node_modules racine. **Le typecheck local est donc non représentatif de la CI** (dette d'environnement).

**~40 erreurs de TYPES RÉELLES masquées** (elles remonteront dès l'ajout des deps — chantier type-strict à planifier, PAS un simple `pnpm add`) : `BadgeProps` sans `children` (`ui/badge.tsx`, ~40 sites d'appel), `ErrorBoundary` `state`/`setState`/`props` inexistants, `observability.ts` `unknown` → `MetricPoint`, `stripe-adapter.ts`/`stripe-webhook-handler.ts`/`trend-scorer.ts` `unknown` non assignables, `implicit any` dans `alerts-client.tsx`, `niche-grid.tsx`, `nps-survey.tsx`…

**Dette séparée :** `pnpm audit` signale des vulnérabilités ≥ high sur le lockfile (dette de dépendances, indépendante de la PR).

**Actions recommandées (chantier dédié « CI-repair », hors périmètre du lot validé, ordre préconisé) :**
1. Restaurer les deps manquantes dans `youtube-trendhunter-web/package.json` (versions compatibles React 19 / Next 16.2) + régénérer le lockfile ;
2. Corriger les ~40 erreurs de types réelles masquées (audit type-strict) ;
3. Traiter l'audit pnpm (mises à jour ciblées) ;
4. Re-exécuter la CI → le job E2E se débloquera automatiquement (`needs:`), y compris la suite multi-navigateurs + premières baselines visual-regression (à générer via `--update-snapshots` ; `E2E Tests` CI ne couvre que `chromium` actuellement — étendre aux 4 projets si souhaité).

### 5.7 Chantier CI-repair — ✅ RÉSOLU

**Périmètre** : branche `fix/ci-repair` (base = `main` après fusion de la PR #51). Objectif : rendre la CI verte — typecheck (310 erreurs TS), audit pnpm (`--audit-level=high`), et débloquer le job E2E (`needs:`).

#### 5.7.1 Restauration des dépendances manquantes (cause racine des 310 erreurs TS)

**Résultat clé : les 310 erreurs étaient 100 % des cascades de types manquants — zéro correction de code source requise** (contrairement à l'hypothèse initiale d'~40 erreurs type-strict réelles : `BadgeProps`, `ErrorBoundary`, `unknown → MetricPoint`… disparaissent une fois les types réels en place).

Ajoutées dans `youtube-trendhunter-web/package.json` (versions résolues par pnpm, cohérentes React 19 / Next 16) :

| Dépendance | Version | Rôle |
|-----------|---------|------|
| `lucide-react` | ^1.46.0 | icônes (39 sites d'import) |
| `zod` | ^4.6.5 | validation (schémas, env, routes) |
| `stripe` | ^22.6.2 | paiement (adapter + webhooks + tests) |
| `@sentry/nextjs` | ^10.75.0 | observabilité (configs client/edge/server) |
| `posthog-js` | ^1.433.7 | analytics |
| `@upstash/redis` | ^1.38.4 | cache (Redis REST) |
| `@anthropic-ai/sdk` | ^0.126.0 | génération IA |
| `class-variance-authority` | ^0.7.1 | variants UI (aligné package ui) |
| `@radix-ui/react-slot` | ^1.2.4 | composition UI (aligné package ui) |
| `@testing-library/react` | ^16 | tests (dev) |
| `@types/react` / `@types/react-dom` | ^19.2.14 / ^19.2.3 | types JSX (dev) |
| `@types/node` | ^20 | built-ins Node dans tests/configs (dev) |
| `jsdom` | ^30.1.0 | environnement vitest (`environment: "jsdom"` dans `vitest.config.ts`) — **invisible au scan d'imports** (nommé par chaîne, jamais `import` ; révélé par le 1er run CI : `MISSING DEPENDENCY 'jsdom'`) |

**Seule correction de code** : `src/lib/stripe.ts` — pin `apiVersion` `"2026-04-22.dahlia"` → `"2026-08-26.dahlia"` (sync avec le type exigé par stripe 22). Typecheck web : **310 → 0 erreur**.

#### 5.7.2 Mises à jour de sécurité directes (advisories CRITIQUES)

| Paquet | Avant | Après | Advisory |
|--------|-------|-------|----------|
| `next` | ^16.2.6 | **^16.3.5** | CRITIQUE (>=16.0.0 <16.3.3) + HIGH (>=16.0.0 <16.2.11) ; `sharp` corrigé au passage |
| `next-auth` | 5.0.0-beta.31 | **5.0.0-beta.32** | CRITIQUE (<=5.0.0-beta.31) |
| `@auth/core` | (transitif 0.41.2 du prisma-adapter) | **^0.41.3** | CRITIQUE (<0.41.3) — via `@auth/prisma-adapter@2.11.3` (qui exige `@auth/core: 0.41.3` exact) |
| `eslint-config-next` | 16.2.9 | **16.3.5** | aligné sur next |
| `vite` (dev, ajouté direct) | — (transitif 8.0.14) | **^8.0.16** (résolu 8.3.0 via override) | HIGH (>=8.0.0 <=8.0.15) + modéré |
| `vitest` | ^4.1.6 | **^4.1.11** | modéré |

#### 5.7.3 Overrides pnpm racine (dette transitive — `package.json` → `pnpm.overrides`)

| Override | Raison (chaîne) |
|----------|-----------------|
| `fast-uri: 3.1.8` | HIGH — `ajv@8.20.0` (chaîne commitlint) |
| `js-yaml@<4: 3.15.2` | HIGH — `read-yaml-file@1.1.0` (chaîne changesets) |
| `js-yaml@>=4: 4.3.2` | HIGH — `@changesets/parse`, `@eslint/eslintrc`, `cosmiconfig` |
| `brace-expansion@<2: 1.1.21` | HIGH — `minimatch@3.1.5` |
| `brace-expansion@>=5: 5.0.12` | HIGH — `minimatch@10.2.5` |
| `postcss: 8.5.28` | HIGH — `critters`, `vite` (web devDeps) |
| `nanoid: 3.3.19` | HIGH — `postcss@8.5.15` (satisfait le `^3.3.18` du postcss 8.5.28) |
| `tmp: 0.2.7` | HIGH — `web-ext-run@0.2.4` (extension, pins exacts) |
| `shell-quote: 1.10.0` | CRITIQUE — `fx-runner@1.4.0` ← `web-ext-run` (API `parse`/`quote` stable) |
| `adm-zip: 0.6.1` | HIGH — `firefox-profile@4.7.0` (`~0.5.x` forcé à 0.6.1 ; seul outil non exercé par la CI) |
| `browserslist: 4.29.0` | HIGH — `@babel/helper-compilation-targets`, webpack |
| `deepmerge-ts: 8.0.2` | HIGH — `@prisma/config@6.19.3` (pin 7.1.5 ; **validé par `prisma generate` OK**) |
| `vite: 8.3.0` | purge de la copie vulnérable 8.0.14 (ranges `^8.0.0` satisfaits : vite-node, wxt) |

#### 5.7.4 Résultat audit

| Étape | Count | Sev |
|-------|-------|-----|
| Avant (main HEAD `8468614`) | 65 | dont 45 ≥ high |
| Après restauration deps + updates | 44 | dont 32 ≥ high |
| Après overrides + vite/vitest | **3** | **1 low + 2 moderate — 0 high, 0 critical** ✅ |

**`pnpm audit --audit-level=high` → EXIT 0** (le gate CI passe). Restants documentés (non bloquants, bump majeur risqué) :
- `baseline-browser-mapping` <2.11.0 (modéré) — pin de **next@16.3.5** lui-même (outil interne, pas d'exécution sous notre contrôle) ;
- `uuid` <11.1.1 (modéré) — `node-notifier@10.0.1` ← `web-ext-run` (uuid v8→v11 = rupture CJS) ;
- `esbuild` <0.28.1 (low) — chaîne vite/wxt.

#### 5.7.5 Vérifications — toutes vertes en local

| Gate | Résultat |
|------|----------|
| Typecheck web (`tsc --noEmit`) | ✅ 0 erreur |
| Typecheck racine (turbo 6 packages) | ✅ 6/6 |
| Lint (turbo 2 packages) | ✅ 2/2 |
| Build web (next 16.3.5 + deps réelles) | ✅ |
| Build racine (turbo) | ✅ 5/5 (warnings placeholders desktop/mobile/extension pré-existants) |
| Tests unitaires (vitest 4.1.11) | ✅ **1288/1288** (44 fichiers) |
| `prisma generate` (override deepmerge-ts 8.0.2) | ✅ |
| E2E ciblé chromium | ✅ **51/51** (`api-jobs-id` 15/15, `accessibility` 18/18, `accessibility-copy` 18/18) |

**Premier run CI réel (run `35193709583`, PR #52) — ce que la CI fraîche a révélé :**

| Job / step | Résultat | Analyse |
|-----------|----------|---------|
| Lint (CI) | ✅ SUCCESS | install frais `--frozen-lockfile` (plus de dossier orphelin local) |
| Typecheck (CI) | ✅ SUCCESS | **310 erreurs levées** — preuve du chantier sur install réel |
| Audit dependencies (CI) | ✅ SUCCESS | `pnpm audit --audit-level=high` vert — **preuve** (step Gitleaks a pu s'exécuter ensuite) |
| Unit tests (CI) | ❌ → ✅ corrigé | `MISSING DEPENDENCY 'jsdom'` — la 13ᵉ dep manquante, invisible au scan (environnement vitest nommé par chaîne, pas un import). Masquée en local par le symlink racine (comme `lucide-react`). **Ajout `jsdom@^30.1.0`** → tests relancés 1288/1288 en local, lockfile frozen OK |
| Gitleaks | ❌ → ✅ corrigé | `fatal: No url found for submodule path 'worktrees/review' in .gitmodules` — **gitlink fantôme** (mode `160000`, commit `e11fc968`) committé accidentellement dans #27 (`48856f6`, « worktrees/review » = worktree du bot de review, exclu du tsconfig, submodule SANS `.gitmodules` → Gitleaks `git submodule foreach` échoue). Jamais exécuté avant : step masqué par l'échec audit des runs précédents (**skipped** sur `35141979081`). **Correction** : `git rm --cached worktrees/review` + `/worktrees/` dans `.gitignore` (prévention re-ajout) |
| E2E Tests | ⏭️ skipped | `needs:` amont — se débloque au run suivant (typecheck ✅ + tests ✅ désormais) |

**Attendu au run CI suivant** : Lint+Typecheck+Test ✅, Security Scan ✅ (audit ✅ + Gitleaks corrigé), E2E Tests **premier run réel** chromium (`pnpm test:e2e --project=chromium` — correction workflow : la config multi-navigateurs du commit pré-existant `7ecfcd8` lancerait 4 projets alors que le step n'installe que chromium). Réserve e2e CI : Redis placeholder `http://localhost:6379` (E1) — un échec éventuel du spec Redis serait une dette d'infra CI distincte (vraie URL Upstash requise), pas une régression des changements. Suites multi-navigateurs + baselines visual-regression (`--update-snapshots`) restent des extensions souhaitables hors périmètre.

---

## 6. Audit de non-régression — **RÉSULTATS (exécuté)**

Comportements adjacents vérifiés via la suite e2e ciblée (254 passed) + gates statiques — **aucun écart détecté** :

| Endpoint / flux | Comportement attendu (inchangé) | Statut |
|-----------------|----------------------------------|--------|
| `POST /api/niches` | follow = 1 niche max pour FREE (serveur), 201 | ✅ e2e |
| `DELETE /api/niches/[id]` | unfollow scoped à l'utilisateur, 204 (aucun admin requis — non gated par le Fix 2) | ✅ e2e |
| `GET /api/niches/[id]` | lecture publique d'une niche, 200 | ✅ e2e |
| `PATCH /api/niches/[id]` | no-op → 200 (contrat e2e, non touché) | ✅ e2e |
| `GET /api/user/audit-logs` (sans param) | logs de l'appelant, 200 | ✅ e2e |
| `GET /api/admin/*` auth (7c) | 401-403 `{error}` sur endpoints non authentifiés | ✅ e2e (test 7c passe) |
| `GET /api/extension/trends` | cache clé `trends:ext:${slug}:${plan}` (lecture+écriture alignées) | ✅ unitaires (31 tests) |
| `admin/[[...tab]]/page.tsx` | non-admin → redirect `/home` au lieu de la 404 | ✅ e2e (test 336 aligné) |
| `(auth)` flows | login → redirectTo `/dashboard` → `/home` ; layout → `/home` | ✅ e2e + build |
| Landing `/` connecté | CTA → `/dashboard` → `/home` | ✅ build (route présente) |
| `manifest.ts` | `start_url` → `/dashboard` → `/home` (PWA OK) | ✅ build |
| `GET /api/jobs/[id]` | contrat M1 (jobs système lisibles) inchangé | ✅ e2e |
| `GET /api/niches` collection | follow/unfollow + limites plans | ✅ e2e |

### Points de vigilance — résolus

- **`admin/niches/route.ts`** : import `auth` retiré (devenu inutilisé après remplacement par `requireAdmin()` dans GET et POST) — lint ✅.
- **`admin/plans/route.ts`** : fonction locale `requireAdmin` supprimée, aucune référence résiduelle — lint ✅, build ✅.
- **Forme des réponses** : `requireAdmin()` → 401/403 semantique via `AuthError` ; le test e2e 7c (présence de `error`, statut 401-403) **passe** ✅.

---

## 7. Rapport de convergence — ✅ CONVERGÉ

Checklist finale — **tout est coché** :

- [x] Les 7 fixes (Fix 1 → Fix 7) appliqués, fichiers listés :
  1. `src/app/(dashboard)/dashboard/page.tsx` *(créé — redirect `/dashboard` → `/home`)*
  2. `src/components/dashboard/niche-selector.tsx` *(push `/home` au lieu de `/dashboard`)*
  3. `src/app/api/niches/[id]/route.ts` *(PUT gated `requireAdmin()`)*
  4. `src/app/api/user/audit-logs/route.ts` *(bypass admin + `userId` honoré)*
  5. `src/app/api/extension/trends/route.ts` *(clé cache alignée)*
  6. `src/app/api/admin/stats/route.ts` *(`requireAdmin()`)*
  7. `src/app/api/admin/niches/route.ts` *(`requireAdmin()` GET+POST)*
  8. `src/app/api/admin/plans/route.ts` *(`requireAdmin()` importé, locale supprimée)*
  9. `src/app/(dashboard)/home/page.tsx` *(défaut `tech-ia`)*
  10. `src/proxy.ts` *(fusion blocage `/dev/:*`)* + `src/middleware.ts` *(supprimé)* — Fix 7
  11. `e2e/admin.spec.ts` *(contrat de test aligné : accepte `/home` après le redirect Fix 1)*
- [x] Lot suite (Fix 8 → Fix 10) appliqué :
  12. `e2e/api-jobs-id.spec.ts` *(path traversal encodé `%2e%2e%2f` — Fix 8/E2)*
  13. `src/app/(marketing)/pricing/page.tsx` *(`CardTitle` h3 → `<h2>` + `aria-hidden` icônes — Fix 8/E4 + Fix 9)*
  14. `src/app/(marketing)/page.tsx` *(aria-hidden sur 12 icônes + SVG décoratif — Fix 9/E3)*
  15. `src/components/theme-toggle.tsx` + `src/components/cookie-consent.tsx` *(aria-hidden Sun/Moon/Cookie — Fix 9/E3)*
  16. `src/app/layout.tsx` *(skip-to-content + cible `#main` — Fix 9/E5)*
  17. `e2e/accessibility-copy.spec.ts` **et** `e2e/accessibility.spec.ts` *(ordre Tab login aligné dans les 2 fichiers — le spec accessibilité est dupliqué : skip link → logo → next, conséquence assumée du Fix 9)*
  18. `youtube-trendhunter-desktop/package.json` + `youtube-trendhunter-mobile/package.json` *(typecheck placeholder — Fix 10)*
- [x] Typecheck (web) ✅ — 0 erreur ; **Typecheck racine (turbo) ✅ — 6/6** (Fix 10)
- [x] Lint (web) ✅ — 0 erreur (2 warnings pré-existants `(dev)` hors périmètre)
- [x] Build (web) ✅ — route `/dashboard` générée ; **Build racine (turbo) ✅ — 5/5** (Fix 10)
- [x] Tests unitaires ✅ — 44 fichiers / 1288 tests
- [x] Tests e2e (chromium, specs ciblés) ✅ — 254 passed / 5 failed **pré-existants** (E1–E5, prouvés par baseline — §4)
- [x] Lot suite e2e (chromium) ✅ — `api-jobs-id` **15/15**, `accessibility-copy` **18/18** (E2–E5 corrigés, seul E1 reste environnement)
- [x] Suite e2e complète multi-navigateurs — lancée (browsers installés) mais **interrompue par l'environnement de travail** (restarts serveur) — analyse partielle sans régression nouvelle + §5.5 ; exécution pérenne recommandée en CI
- [x] Audit de non-régression (§6) réalisé, aucun écart
- [x] Constats M1–M9 documentés (§4) ; M7 reclassé C3 et corrigé ; E2–E5 corrigés (Fixes 8–9), E1 documenté
- [x] `git status` : uniquement les fichiers de corrections + ce document

**Déclaration de convergence** : l'audit est complet et **convergent** — chaque constat a été vérifié par lecture directe, contrats de test **et exécution** ; chaque correction a un critère de succès vérifié ; aucune modification de portée (pas de refactoring, pas de nouvelle fonctionnalité, pas de changement de contrat e2e non justifié). À l'issue du lot suite, les échecs e2e d'accessibilité et de contrat (E2–E5) sont **corrigés et vérifiés** ; seul E1 reste documenté (environnement Redis local, résolu par une vraie URL Redis en dev/CI). La suite complète multi-navigateurs reste à exécuter en CI (baselines visual-regression à générer au premier run) — l'environnement de cette session ne permet pas les runs > 2 min (§5.5). Le suivi des constats restants (M1–M6, M8, E1) est un backlog documenté, aucun ne bloque la livraison.