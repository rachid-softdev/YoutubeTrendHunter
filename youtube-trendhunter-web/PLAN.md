# TrendHunter — Plan de développement complet

> **Note**: Ce fichier est partiellement obsolète. Voir [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) pour l'état actuel.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Site marketing + dashboard web | Next.js 16 (App Router) |
| Auth | NextAuth.js v5 (Auth.js) — Google OAuth |
| Base de données | PostgreSQL + Prisma ORM |
| Paiements | Stripe (Subscriptions + Customer Portal) |
| Extension navigateur | Chrome Extension Manifest V3 (WXT framework, React) |
| IA | Anthropic Claude API |
| Cache | Upstash Redis |
| Email | Resend |
| Déploiement | Vercel |
| Types partagés | `@youtube-trendhunter/types` (workspace package) |

---

## Architecture — Base de données

### Modèle Prisma

**Auth** — Comptes, sessions, tokens de vérification (tables NextAuth standard).

**User** — Profils utilisateur, relations Stripe, abonnements, tokens API.

**Subscription** — Liée à Stripe (plan FREE/PRO/TEAM, statut ACTIVE/CANCELED/PAST_DUE/TRIALING/INCOMPLETE).

**Niche** — Catégories de contenu : slug unique (ex: `finance-personnelle`), nom, mots-clés YouTube, langue.

**Trend** — Tendances détectées :
- `title`, `description`, `score`, `velocity`, `status` (EMERGING/GROWING/PEAK/FADING)
- `contentAngles String[]` — angles de contenu proposés par l'IA
- `searchVolume`, `videoCount`, `avgViews`
- `detectedAt`, `expiresAt` (TTL 7 jours)

**Alert** — Alertes personnalisées sur des mots-clés, seuils de score.

**ApiToken** — Tokens pour l'authentification de l'extension Chrome.

**UserNiche** — Relation user ↔ niche (limites plan Free).

---

## Architecture — API Routes

### Routes principales

| Route | Méthode | Description | Auth |
|---|---|---|---|
| `/api/trends?niche=slug` | GET | Tendances d'une niche | Session (dashboard) |
| `/api/trends/niches` | GET | Liste des niches disponibles | Session |
| `/api/extension/trends?niche=slug` | GET | Tendances pour l'extension | Bearer token (ApiToken) |
| `/api/extension/auth` | POST | Générer un token d'extension | Session |
| `/api/user/export` | GET | Export CSV des tendances | Session |
| `/api/stripe/checkout` | POST | Créer une session Stripe | Session |
| `/api/stripe/portal` | POST | Lien vers Customer Portal | Session |
| `/api/stripe/webhook` | POST | Webhooks Stripe | Signature Stripe |
| `/api/auth/...` | * | Routes NextAuth | — |

### Architecture extension (extension)

- **Communication** : `browser.runtime.sendMessage` entre sidepanel et background
- **Auth** : Token stocké dans `chrome.storage.session`
- **API base URL** : Configurable via `chrome.storage.sync` (options page)
  - Défaut : `http://localhost:3000`
  - Variable d'environnement : `VITE_API_BASE_URL`
- **Background** : Service Worker WXT — gère l'ouverture du sidepanel et les requêtes API
- **Sidepanel** : WXT + React — affiche les tendances par niche

### Limites par plan

| Plan | Niches | Tendance/niche | Alertes | Export |
|---|---|---|---|---|
| FREE | 1 | 5 | Non | Non |
| PRO | Illimité | Illimité | Oui | Oui |
| TEAM | Illimité | Illimité | Oui | Oui |

---

## Architecture — Scoring IA

Les tendances sont scorées via Claude (Anthropic) qui reçoit :
- Titre de la tendance, niche, langue
- Volume de recherche, nombre de vidéos existantes, vues moyennes
- Croissance sur 48h

Retourne un JSON structuré :
```json
{
  "score": 85,
  "status": "GROWING",
  "contentAngles": ["Angle 1", "Angle 2", "Angle 3"],
  "reasoning": "..."
}
```

Le `TrendScore` est validé par Zod avant enregistrement.

---

## Flux utilisateur

1. Landing → login Google → dashboard (création abonnement Stripe)
2. Dashboard → sélection niche → visualisation tendances + content angles
3. Billing → génération token API → configuration dans l'extension
4. Extension → navigation YouTube → sidepanel avec tendances de la niche

---

## Composants dashboard

- `trend-card.tsx` — Carte tendance avec score, métriques, content angles, statut
- `sidebar.tsx` — Navigation latérale
- `niche-selector.tsx` — Sélecteur de niche
- `alert-form.tsx` — Formulaire d'alerte
- `generate-token-button.tsx` — Génération token extension

---

## Checklist de déploiement

- [ ] Variables d'environnement en production (base de données, Stripe, Google OAuth, Anthropic, Redis, Resend)
- [ ] Migration Prisma en production
- [ ] Webhook Stripe configuré
- [ ] URI de redirection Google OAuth mise à jour
- [ ] Extension Chrome publiée sur Chrome Web Store
