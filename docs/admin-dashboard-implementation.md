# Plan d'implémentation — Dashboard Admin complet

> **Statut** : Spécification prête pour implémentation (à réaliser dans un **worktree dédié**, puis à merger sur `main` et supprimer).
> **Repo** : `D:\git-projects\YoutubeTrendHunter` — app web : `youtube-trendhunter-web`
> **Langue du code existant** : FR (UI), EN (messages API/erreurs) — respecter l'existant.

---

## 1. Contexte — État des lieux (vérifié le 2026-09-17)

### 1.1 Ce qui existe déjà

| Couche | Détail |
|---|---|
| **UI Admin** | `src/app/(dashboard)/admin/[[...tab]]/page.tsx` (623 lignes, **1 seul fichier serveur monolithique**) — 6 onglets : Overview, Utilisateurs, Revenus, Logs, Niches, Monitoring |
| **Monitoring** | `src/app/(dashboard)/admin/monitoring-tab.tsx` (client, SSE + polling 5s fallback) — **seul composant réellement branché** |
| **Auth** | `src/lib/auth/require-admin.ts` (`requireAdmin()` — check session + rôle `ADMIN_EMAILS` env), proxy `src/proxy.ts` protège `/admin` |
| **Backend API** | 18 routes `src/app/api/admin/*` (voir §2) |
| **Feature Flags** | `src/lib/feature-flags/` complet : `feature-gate.service.ts`, `entitlement-repository.ts`, `downgrade.service.ts`, `cache-service.ts`, `types.ts`, `middleware.ts`, `experiment.ts` |
| **Services** | `src/lib/services/` : `user`, `niche`, `trend`, `alert`, `subscription`, `job` |
| **Tests e2e** | `e2e/admin.spec.ts` (>1300 l), `admin-users.spec.ts`, `admin-niches.spec.ts`, `admin-monitoring.spec.ts`, `api-admin.spec.ts`, `api-admin-crud.spec.ts`, `api-admin-advanced.spec.ts` |
| **Tests unitaires** | `src/app/api/__tests__/admin-crud.test.ts` |
| **Doc** | `docs/FEATURES.md` §4.9 (endpoints), `docs/AUDIT_IMPLEMENTATION.md` (fixes + alerte M6 non corrigée) |

### 1.2 Problèmes identifiés (gaps)

| # | Gap | Sévérité |
|---|---|---|
| G1 | **L'UI n'appelle pas les routes API admin** — elle fait des requêtes Prisma côté serveur (`getRecentUsers(50)`, `getAllNichesWithCounts()`, `prisma.auditLog.findMany`) alors que des routes API paginées/recherche/export existent et sont testées | 🔴 Haute |
| G2 | **Boutons morts** : search users, export CSV, delete user, add/edit/toggle niche, filtre logs, export logs — aucun handler | 🔴 Haute |
| G3 | **Système Feature Flags / Plans / Overrides / Orgs sans UI** : 9 routes API orphelines (plans, features, overrides, entitlements, downgrade-preview, cache-invalidate) | 🔴 Haute |
| G4 | **Aucun accès /admin dans la navigation** (Sidebar + MobileNav) — on y va par URL uniquement | 🟡 Moyenne |
| G5 | **Onglets métier absents** : Tendances, Alertes, Abonnements, Rôles | 🟡 Moyenne |
| G6 | **Données simulées** : Revenue (graphique 6 mois hardcodé, "+12%" en dur), MRR hardcodé `pro*15 + team*39` (duplique `src/lib/plans.ts` — alerte M6 documentée, **non corrigée**) | 🟡 Moyenne |
| G7 | **Pas de pagination** : Users = 50 max, Logs = 100 max | 🟡 Moyenne |
| G8 | **Tests e2e qui mockent des endpoints jamais appelés par l'UI** → "verts" mais testent du vide | ⚠️ Qualité |
| G9 | Incohérence nav mobile : labels anglais ("Trends", "Alerts", "Billing") vs FR | 🟢 Basse |

---

## 2. Contrat API existant (à consommer — ne pas recréer)

Toutes ces routes existent, sont protégées par `requireAdmin()`, et sont déjà testées (`api-admin-crud.spec.ts`, `api-admin-advanced.spec.ts`, `admin-crud.test.ts`). **L'implémentation UI doit les consommer telles quelles.**

| Méthode | Route | Comportement |
|---|---|---|
| GET | `/api/admin/users?page&limit&search` | Liste paginée + `pagination{page,limit,total,totalPages,hasNext,hasPrev}` |
| DELETE | `/api/admin/users/[id]` | Suppression en cascade (sessions, tokens, alerts, logs, sub…) → 204 |
| GET | `/api/admin/users/export?search` | CSV (échap. injection formulaire) |
| GET | `/api/admin/stats` | `stats{totalUsers,totalSubscriptions,proCount,teamCount,freeCount,totalTrends,activeAlerts,mrr}` + `recentUsers[10]` |
| GET/POST | `/api/admin/niches` | Liste + création (zod : name, slug `^[a-z0-9-]+$`, description≤500, keywords[], language(2), isActive) / 409 slug dupliqué |
| GET/PATCH/DELETE | `/api/admin/niches/[id]` | Détail + mise à jour + suppression (cascade userNiches + trends) |
| GET | `/api/admin/plans?page&limit&sort` | Plans paginés (FREE/PRO/TEAM) |
| GET/POST | `/api/admin/plans/[planKey]/features` | Associer feature à plan (upsert, `downgradeStrategy` GRACEFUL) |
| GET/POST | `/api/admin/features?page&limit&sort&type` | CRUD features (types : BOOLEAN, LIMIT, EXPERIMENT) |
| PUT | `/api/admin/features/[key]` | Mise à jour feature |
| GET/POST | `/api/admin/overrides?scope&scopeId` | Lister/créer overrides (reason obligatoire, scope ORG/USER, invalide cache) |
| DELETE | `/api/admin/overrides/[id]` | Supprimer override |
| GET | `/api/admin/orgs/[orgId]/entitlements` | Entitlements d'une org |
| GET | `/api/admin/orgs/[orgId]/downgrade-preview?targetPlan` | Preview downgrade |
| POST | `/api/admin/cache/invalidate/[orgId]` | Invalidation cache |
| GET | `/api/admin/metrics` | Snapshot RED metrics (`metrics.getStats()`) |
| GET | `/api/admin/monitoring` | Stats enrichies (endpoints, totals, rateHistory) |
| GET | `/api/admin/monitoring/stream` | SSE temps réel |

### Modèles Prisma concernés (déjà dans le schéma)
`User`, `Subscription`, `Niche`, `Trend`, `Alert`, `AuditLog`, `Plan`, `Feature`, `PlanFeature`, `EntitlementOverride`, `UserRole`, `Org`, `ApiToken`, `Job`, `Session`, `Account`.

---

## 3. Stratégie de branche

Le worktree se créera depuis `main` :

```bash
# depuis la racine du repo
git worktree add .worktrees/admin-dashboard -b feat/admin-dashboard
# ... travail + commits ...
git worktree remove .worktrees/admin-dashboard  # après merge
git worktree prune
```

**Workflow final** : branche `feat/admin-dashboard` → commits atomiques → merge dans `main` (PR) → suppression du worktree. Chaque phase = 1 commit propre ; ne pas mélanger les phases.

> Note : `worktrees/review` existe déjà pour d'autres usages — le nouveau worktree ira dans `.worktrees/admin-dashboard` (déjà gitignoré si convention existante, sinon ajouter).

---

## 4. Architecture cible — Refonte de l'UI admin (Phase 1)

### 4.1 Découpage monolithique → composants

Le fichier `page.tsx` (623 lignes) devient un **coquille serveur fine** ; chaque onglet devient un **client component** paginé qui appelle les routes API.

```
src/app/(dashboard)/admin/
├── layout.tsx                      # (nouveau) header + nav tabs + guard admin (déplacé depuis page.tsx)
├── page.tsx                        # coquille : <AdminTabs /> (ou redirect selon tab)
└── [[...tab]]/
    └── page.tsx                    # supprimé (remplacé par layout + composants)
```

```
src/components/admin/               # (nouveau)
├── admin-tabs.tsx                  # nav tabs (client, `usePathname`)
├── users-tab.tsx                   # table + search debounce + pagination + delete + export
├── users-table.tsx                 # (optionnel) sous-composant table
├── niches-tab.tsx                  # cards + modale create/edit + toggle + delete
├── niche-form.tsx                  # formulaire zod-compatible (name, slug, description, keywords, language, isActive)
├── logs-tab.tsx                    # table + filtre action + pagination + export
├── revenue-tab.tsx                 # données réelles via /api/admin/stats (remplace simulé)
├── monitoring-tab.tsx              # ⚠️ DÉPLACÉ depuis app/(dashboard)/admin/ (garder tel quel)
├── plans-tab.tsx                   # (Phase 3) liste plans + features attachées
├── plan-form.tsx                   # (Phase 3)
├── features-tab.tsx                # (Phase 3) CRUD features + toggle isActive
├── overrides-tab.tsx               # (Phase 3) liste + création (reason) + suppression
├── orgs-tab.tsx                    # (Phase 3) recherche org → entitlements, dégradation, cache
├── trends-tab.tsx                  # (Phase 4, optionnel)
├── alerts-tab.tsx                  # (Phase 4, optionnel)
└── ui/
    ├── confirm-dialog.tsx          # confirmation destructive (delete user/niche/override)
    └── empty-state.tsx             # état vide réutilisable
```

**Règle d'or** : chaque onglet client utilise un hook `useSWR`/`useEffect` + état local (le projet n'a pas de SWR — vérifier `package.json`, sinon `useEffect` simple, **pas de nouvelle dépendance sauf nécessaire**).

### 4.2 Garde admin (serveur)

Conserver dans `layout.tsx` du groupe admin la logique actuelle de `page.tsx:51-55` :
```ts
const session = await auth();
if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) redirect("/dashboard");
```
**Pas de changement de la logique d'auth** (déjà correcte + testée e2e).

### 4.3 Lien dans la navigation (G4)

- `src/components/dashboard/sidebar.tsx` : ajouter un item conditionnel `{ href: "/admin", icon: Shield, label: "Administration" }`
- `src/components/dashboard/mobile-nav.tsx` : idem
- **Condition** : l'item ne doit être visible que pour les admins. Le plus simple : le layout `(dashboard)/layout.tsx` (serveur) lit `ADMIN_EMAILS` et passe `isAdmin` à `Sidebar`/`MobileNav` en prop. (Ne PAS exposer la liste d'emails — juste un booléen.)
- Corriger au passage l'incohérence de labels mobile (G9) → FR : "Tendances", "Niches", "Alertes", "Facturation", "Paramètres".

---

## 5. Phase 2 — Brancher les onglets existants sur l'API

### 5.1 Onglet Utilisateurs

**Avant** : `getRecentUsers(50)` (serveur) + boutons morts.
**Après** : client component `users-tab.tsx` → `GET /api/admin/users`.

- **État** : `{ page, limit, search, users, pagination, loading, error }`
- **Recherche** : input avec **debounce 300 ms** → `GET /api/admin/users?search=...` (API déjà insensible à la casse, recherche sur email + name)
- **Pagination** : `pagination` de la réponse ; boutons Précédent/Suivant + infos "page X / Y" ; `hasNext`/`hasPrev`
- **Exporter CSV** : lien `<a href="/api/admin/users/export?search=...">` (GET simple, déjà implémenté avec `Content-Disposition`)
- **Supprimer** : icône → `ConfirmDialog` → `DELETE /api/admin/users/[id]` → 204 → re-fetch. Prévenir : suppression **définitive** en cascade.

### 5.2 Onglet Niches

**Avant** : `getAllNichesWithCounts()` (serveur) + boutons morts.
**Après** : client component `niches-tab.tsx` → `GET/POST /api/admin/niches`, `PATCH/DELETE /api/admin/niches/[id]`.

- **Liste** : cards actuelles (conserver le design) alimentées par `GET /api/admin/niches`
- **"+ Ajouter une niche"** : modale `niche-form.tsx` → `POST /api/admin/niches` (champs : name, slug, description, keywords, language, isActive). Afficher les erreurs zod (`details` du 400) et le 409 slug dupliqué
- **"Éditer"** : pré-remplir le formulaire → `PATCH /api/admin/niches/[id]`
- **"Désactiver / Activer"** : `PATCH /api/admin/niches/[id]` avec `{ isActive: !current }`
- **Supprimer** (nouveau) : bouton trash + `ConfirmDialog` → `DELETE /api/admin/niches/[id]` → avertir que ça supprime aussi tendances + follows

### 5.3 Onglet Logs

**Avant** : `prisma.auditLog.findMany({ take: 100 })` (serveur) + filtre/export morts.
**Après** : client component `logs-tab.tsx`.

- 🆕 **Créer la route** `GET /api/admin/logs?page&limit&action` (pattern strictement identique à `users/route.ts` : `requireAdmin`, pagination, try/catch `AuthError`) :
  ```ts
  // select : createdAt, userId, action, ipAddress, metadata + user{email,name}
  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take })
  ```
- **Filtre** : le `<select>` existant (LOGIN, SUBSCRIPTION_CREATED, SUBSCRIPTION_CANCELED, ALERT_CREATED, API_TOKEN_GENERATED, CRON_TRENDS_PROCESSED) → param `action`
- **Pagination** : paginée comme users
- **Export** (optionnel) : CSV côté client (`blob` + `URL.createObjectURL`) sur la page courante filtrée, ou nouvelle route `export` — **recommandé en ligne client** pour rester simple (pas de nouvelle route si le dataset filtré est raisonnable)

### 5.4 Onglet Revenue — vraies données (G6)

**Avant** : `months`/`revenueData`/`monthlyRevenue` hardcodés, "+12%" en dur.
**Après** : client component `revenue-tab.tsx` → `GET /api/admin/stats`.

- Prendre `stats.proCount`, `teamCount`, `mrr` de la route (MRR déjà calculé côté API — ne plus dupliquer `pro*15 + team*39` dans l'UI)
- **Graphique 6 mois** : remplacer par un graphique dérivé de vraies données si une table de paiements existe, sinon **afficher un état "historique indisponible"** + les cartes réelles (MRR actuel, Pro|Team) — ne PAS inventer de chiffres
- **Croissance MRR** : si pas de données historiques, masquer la carte (ou afficher "N/A") au lieu de "+12%" fictif
- ⚠️ Ne casser aucun test e2e : `admin.spec.ts` teste la présence des labels/barres — adapter les assertions au nouveau rendu (voir §8)

### 5.5 Overview — brancher sur `/api/admin/stats` (optionnel)

L'overview est serveur-rendu et fonctionnel ; le laisser tel quel **ou** le basculer sur la route pour la cohérence. **Recommandé : laisser en serveur** (pas de gain), sauf si on veut `recentUsers` (déjà fourni par `/api/admin/stats`) — l'ajouter comme bloc "Derniers inscrits" serait un plus rapide.

### 5.6 Bug MRR (M6)

Puisque `stats/route.ts` calcule déjà `mrrEstimate = proCount * 15 + teamCount * 39`, centraliser dans `src/lib/plans.ts` :
```ts
export const PRICING = { PRO: 15, TEAM: 39 }; // source unique
```
et l'utiliser dans `admin/stats/route.ts` (et `page.tsx` si encore serveur). **Petit commit isolé**, documenté comme résolution de l'alerte M6 de `AUDIT_IMPLEMENTATION.md`.

---

## 6. Phase 3 — UI Feature Flags / Plans / Overrides / Orgs (G3)

**Le backend est à 100 % prêt et testé. Il ne manque que l'UI.** C'est le gain le plus important du projet (le système d'entitlements existe mais personne ne peut l'administrer).

### 6.1 Nouveaux onglets

| Onglet | Données | Actions |
|---|---|---|
| **Plans** | `GET /api/admin/plans` ; features d'un plan : `GET /api/admin/plans/[planKey]/features` | Éditer plan (nom, prix, sortOrder), **attacher/détacher une feature** (`POST /api/admin/plans/[planKey]/features` avec featureKey, enabled, limitValue, downgradeStrategy, sortOrder) |
| **Features** | `GET /api/admin/features?page&limit&sort&type` | Créer (`POST`), éditer (`PUT /api/admin/features/[key]` : name, description, type, defaultConfig JSON, isActive), toggle `isActive` |
| **Overrides** | `GET /api/admin/overrides?scope&scopeId` | Créer (`POST` : scope ORG/USER, scopeId, featureKey, enabled, limitValue, configJson, expiresAt, **reason obligatoire**) ; supprimer (`DELETE /api/admin/overrides/[id]`) |
| **Organisations** | Recherche org → `GET /api/admin/orgs/[orgId]/entitlements` | Voir entitlements ; **Preview downgrade** (`GET .../downgrade-preview?targetPlan=free`) ; **Invalidation cache** (`POST .../cache/invalidate/[orgId]`) |

### 6.2 Précisions d'implémentation

- **Form JSON** pour `defaultConfig`/`configJson` : textarea + `JSON.parse` avec message d'erreur clair en cas de JSON invalide
- **Overrides** : le champ `reason` est **obligatoire** (audit) — le marquer `required` + placeholder "Motif (audit trail)"
- **Cache invalidation** : bouton "Purger le cache" avec **confirmation** (impact prod)
- **Types** `FeatureType` : importer depuis `@/lib/feature-flags/types` côté client pour le select BOOLEAN/LIMIT/EXPERIMENT
- Toutes ces routes renvoient `{ data, pagination }` → créer un petit helper client `fetchAdmin<T>(url, init)` centralisant l'erreur (`AuthError` 401/403 → redirection) et le parsing

### 6.3 Sécurité

- Ne **jamais** exposer la liste `ADMIN_EMAILS`, les secrets, les tokens API
- Toutes les mutations passent par les routes existantes (`requireAdmin` côté serveur) — l'UI n'ajoute **aucune** autorisation elle-même
- Échec réseau / 401 / 403 → état d'erreur visible, pas de crash silencieux

---

## 7. Phase 4 (optionnelle mais recommandée) — Onglets métier manquants (G5)

| Onglet | Besoin | Backend |
|---|---|---|
| **Tendances** | Lister les tendances (actives/expirées par niche), supprimer une tendance invalide/spam | 🆕 `GET /api/admin/trends?page&niche&status` + `DELETE /api/admin/trends/[id]` (utiliser `trend.service.ts` existant) |
| **Alertes** | Lister les alertes actives, désactiver massivement si abus | 🆕 `GET /api/admin/alerts` (réutiliser `alert.service.ts`) |
| **Abonnements** | Par user : changer de plan, annuler, voir historique | 🆕 `PATCH /api/admin/subscriptions/[id]` (ou étendre `users/[id]`) avec audit log |
| **Rôles** | Promouvoir/rétrograder un user (table `UserRole` + `User.role`) | 🆕 `PATCH /api/admin/users/[id]` acceptant `{ role }` (body ≠ DELETE actuel) |

**Chaque nouvelle route suit le template canonique** (cf. `docs/AUDIT_IMPLEMENTATION.md` Fix 5) :
```ts
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    // ... zod + prisma ...
    return NextResponse.json({ data, pagination });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[Admin/X] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
```

---

## 8. Phase 5 — Tests

### 8.1 Adapter l'existant (obligatoire — G8)

Les specs actuelles mockent les endpoints **et** le contenu serveur "best effort". Une fois l'UI branchée sur les routes :
- **`admin.spec.ts`** : les tests deviennent déterministes (l'UI appelle réellement les routes mockées) → **retirer les branches `if (onAdmin)`** dupliquées et durcir les assertions
- **`admin-users.spec.ts`** : vérifier que search debounce, pagination, delete (avec mock du DELETE) et le lien export fonctionnent réellement
- **`admin-niches.spec.ts`** : tester l'ajout (mock POST 201, vérifier re-rendu), l'édition, le toggle
- **`admin-monitoring.spec.ts`** : inchangé (déjà branché)

### 8.2 Nouveaux tests

- **Unitaires** (`src/app/api/__tests__/`) : `admin-logs.test.ts` (pagination + filtre action), `admin-trends.test.ts` / `admin-alerts.test.ts` / `admin-users-patch.test.ts` selon Phase 4 — pattern existant `admin-crud.test.ts`
- **e2e** : `admin-plans-features.spec.ts`, `admin-overrides.spec.ts`, `admin-orgs.spec.ts` (Phase 3) avec mocks `route()` sur les endpoints existants
- **Auth** : 401 sans session, 403 user non-admin sur chaque **nouvelle** route

### 8.3 Gates de qualité

```bash
pnpm typecheck && pnpm lint && pnpm build   # à la racine du worktree web
pnpm test                                   # unitaires
pnpm e2e:admin                              # specs admin ciblées (chromium)
```
**Critère : 0 régression** sur les specs existantes + nouvelles specs vertes.

---

## 9. Définition de done

- [ ] L'UI admin consomme exclusivement les routes API admin (fini le Prisma direct dans les tabs serveur)
- [ ] Aucun bouton mort sur Users / Niches / Logs (toutes les actions branchées + ConfirmDialog sur les actions destructives)
- [ ] Revenue affiche des données réelles (ou état "N/A" explicite), MRR centralisé dans `src/lib/plans.ts`
- [ ] Onglets Plans, Features, Overrides, Organisations fonctionnels (CRUD complet)
- [ ] Lien "Administration" dans Sidebar + MobileNav, visible admin uniquement
- [ ] Labels nav FR cohérents
- [ ] Toutes les nouvelles routes suivent le template `requireAdmin` + `AuthError`
- [ ] Tests : specs admin adaptées + nouvelles (unit + e2e) vertes ; `typecheck`/`lint`/`build` OK
- [ ] (Optionnel Phase 4) Tendances / Alertes / Abonnements / Rôles administrables

---

## 10. Risques & pièges

| Risque | Mitigation |
|---|---|
| Casser les e2e existants qui dépendent du rendu serveur | Adapter les specs **dans le même commit** que le branchement UI/API |
| `defaultConfig`/`configJson` mal formés → crash rendu | Parsing JSON strict avec message d'erreur, jamais `JSON.parse` non protégé |
| Suppressions cascades (user, niche) | ConfirmDialog + wording explicitant l'impact |
| Le `[[...tab]]` catch-all : la nouvelle structure (layout + tabs) doit conserver les URLs `/admin`, `/admin/users`, `/admin/niches`, `/admin/logs`, `/admin/revenue`, `/admin/monitoring` + nouvelles (`/admin/plans`, `/admin/features`, `/admin/overrides`, `/admin/orgs`) | Garder le param dynamique ; les liens existants (tests, bookmarks) continuent de marcher |
| Nouvelle dépendance UI (table, modal, toast) | Privilégier les composants UI existants (`src/components/ui/`) ; **aucune** nouvelle dépendance sans justification |
| Worktree : oublier de merger/supprimer | Procédure §3 + `git worktree prune` final |

---

## 11. Ordre d'exécution recommandé (commits atomiques)

1. `refactor(admin): split page.tsx into layout + client tab components` (Phase 1 — structure, zéro changement de comportement)
2. `fix(web): centralise MRR pricing dans src/lib/plans.ts (M6)` (isolé)
3. `feat(admin): wire Users tab to /api/admin/users (search, pagination, export, delete)` (+ adapt e2e users)
4. `feat(admin): wire Niches tab to CRUD API (create, edit, toggle, delete)` (+ adapt e2e niches)
5. `feat(admin): add logs API route + wire Logs tab (filter, pagination, export)`
6. `feat(admin): real revenue data from /api/admin/stats` (+ adapt e2e revenue)
7. `feat(admin): Plans & Features tabs` + e2e
8. `feat(admin): Overrides & Orgs tabs` + e2e
9. `feat(admin): sidebar/mobile admin link (isAdmin prop)` + labels FR
10. `feat(admin): Trends/Alerts/Subscriptions/Roles tabs` (Phase 4, optionnelle)
11. Final : typecheck, lint, build, tests, merge PR, suppression worktree