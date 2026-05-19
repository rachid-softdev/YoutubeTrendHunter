# TrendHunter — Plan de développement complet

> Plan destiné à une IA de coding. Chaque section est autonome et contient les instructions exactes d'implémentation. Suivre l'ordre des phases.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Site marketing + dashboard web | Next.js 14 (App Router) |
| Auth | NextAuth.js v5 (Auth.js) — Google OAuth |
| Base de données | PostgreSQL + Prisma ORM |
| Paiements | Stripe (Subscriptions + Customer Portal) |
| Extension navigateur | Chrome Extension Manifest V3 |
| IA | Anthropic Claude API (claude-sonnet-4-20250514) |
| Cache | Upstash Redis |
| Email | Resend |
| Déploiement | Vercel |

---

## Phase 1 — Initialisation du projet

### 1.1 Créer le projet Next.js

```bash
npx create-next-app@latest trendhunter-web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd trendhunter-web
```

### 1.2 Installer toutes les dépendances

```bash
# Auth
npm install next-auth@beta @auth/prisma-adapter

# ORM + DB
npm install prisma @prisma/client

# Stripe
npm install stripe @stripe/stripe-js

# IA
npm install @anthropic-ai/sdk

# Email
npm install resend

# Cache
npm install @upstash/redis

# UI
npm install lucide-react clsx tailwind-merge

# Utilitaires
npm install zod date-fns

# Dev
npm install -D @types/node tsx dotenv-cli
```

### 1.3 Structure des dossiers à créer

```
trendhunter-web/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── niches/page.tsx
│   │   │   ├── alerts/page.tsx
│   │   │   ├── billing/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (marketing)/
│   │   │   ├── page.tsx          ← landing page
│   │   │   ├── pricing/page.tsx
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── stripe/
│   │   │   │   ├── checkout/route.ts
│   │   │   │   ├── portal/route.ts
│   │   │   │   └── webhook/route.ts
│   │   │   ├── trends/
│   │   │   │   ├── route.ts       ← GET /api/trends?niche=finance
│   │   │   │   └── [id]/route.ts
│   │   │   ├── niches/route.ts
│   │   │   └── extension/
│   │   │       ├── auth/route.ts  ← utilisé par l'extension
│   │   │       └── trends/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                   ← composants réutilisables
│   │   ├── dashboard/
│   │   └── marketing/
│   ├── lib/
│   │   ├── auth.ts               ← config NextAuth
│   │   ├── prisma.ts             ← client Prisma singleton
│   │   ├── stripe.ts             ← client Stripe
│   │   ├── anthropic.ts          ← client Claude
│   │   ├── redis.ts              ← client Upstash
│   │   └── utils.ts
│   ├── types/
│   │   └── index.ts
│   └── middleware.ts
├── prisma/
│   └── schema.prisma
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── sidebar/
│   │   ├── index.html
│   │   ├── app.js
│   │   └── style.css
│   └── icons/
├── .env.local
└── .env.example
```

### 1.4 Composants UI et hooks à créer

```
trendhunter-web/src/
├── components/
│   ├── ui/
│   │   ├── button.tsx       ← Bouton réutilisable
│   │   ├── input.tsx        ← Input réutilisable
│   │   ├── card.tsx         ← Card réutilisable
│   │   └── badge.tsx       ← Badge (Free/Pro/Team)
│   ├── dashboard/
│   │   ├── sidebar.tsx              ← Sidebar navigation
│   │   ├── trend-card.tsx           ← Carte tendance
│   │   ├── niche-selector.tsx      ← Sélecteur de niche
│   │   ├── alert-form.tsx          ← Formulaire d'alerte
│   │   ├── manage-subscription-button.tsx  ← Bouton gérer abonnement
│   │   └── generate-token-button.tsx     ← Bouton générer token
│   └── marketing/
│       ├── hero.tsx           ← Section hero landing
│       ├── pricing-card.tsx    ← Carte tarif
│       └── feature.tsx         ← Feature list item
├── hooks/
│   └── use-trends.ts         ← Hook pour récupérer les tendances
```

---

## Phase 2 — Base de données (Prisma + PostgreSQL)

### 2.1 Initialiser Prisma

```bash
npx prisma init --datasource-provider postgresql
```

### 2.2 Schema Prisma complet

Fichier : `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─────────────────────────────────────────
// AUTH (NextAuth.js — tables obligatoires)
// ─────────────────────────────────────────

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ─────────────────────────────────────────
// UTILISATEURS
// ─────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations auth
  accounts Account[]
  sessions Session[]

  // Relations métier
  subscription  Subscription?
  watchedNiches UserNiche[]
  alerts        Alert[]
  apiTokens     ApiToken[]

  // Stripe
  stripeCustomerId String? @unique
}

// ─────────────────────────────────────────
// ABONNEMENTS STRIPE
// ─────────────────────────────────────────

model Subscription {
  id                   String             @id @default(cuid())
  userId               String             @unique
  stripeSubscriptionId String             @unique
  stripePriceId        String
  stripeCurrentPeriodEnd DateTime
  status               SubscriptionStatus @default(ACTIVE)
  plan                 Plan               @default(FREE)
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum SubscriptionStatus {
  ACTIVE
  CANCELED
  PAST_DUE
  TRIALING
  INCOMPLETE
}

enum Plan {
  FREE
  PRO
  TEAM
}

// ─────────────────────────────────────────
// NICHES
// ─────────────────────────────────────────

model Niche {
  id          String   @id @default(cuid())
  slug        String   @unique  // ex: "finance-personnelle"
  name        String            // ex: "Finance personnelle"
  description String?
  keywords    String[]          // mots-clés de recherche YouTube
  language    String   @default("fr")
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  trends      Trend[]
  userNiches  UserNiche[]
}

// Niche suivie par un utilisateur
model UserNiche {
  id        String   @id @default(cuid())
  userId    String
  nicheId   String
  createdAt DateTime @default(now())

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  niche Niche @relation(fields: [nicheId], references: [id], onDelete: Cascade)

  @@unique([userId, nicheId])
}

// ─────────────────────────────────────────
// TENDANCES
// ─────────────────────────────────────────

model Trend {
  id          String      @id @default(cuid())
  nicheId     String
  title       String
  description String?
  score       Int         // 0-100, calculé par Claude
  velocity    Float       // % de croissance sur 48h
  status      TrendStatus @default(EMERGING)
  
  // Données sources
  searchVolume    Int?    // Google Trends volume
  videoCount      Int?    // nb vidéos YouTube sur ce sujet
  avgViews        Int?    // vues moyennes par vidéo
  
  // Angles générés par Claude
  contentAngles   String[]
  
  // Timestamps
  detectedAt  DateTime @default(now())
  expiresAt   DateTime // TTL : 7 jours
  updatedAt   DateTime @updatedAt

  niche  Niche   @relation(fields: [nicheId], references: [id], onDelete: Cascade)

  @@index([nicheId, score(sort: Desc)])
  @@index([detectedAt])
}

enum TrendStatus {
  EMERGING   // score 0-49
  GROWING    // score 50-74
  PEAK       // score 75-100
  FADING     // déclin détecté
}

// ─────────────────────────────────────────
// ALERTES
// ─────────────────────────────────────────

model Alert {
  id        String      @id @default(cuid())
  userId    String
  nicheId   String?
  type      AlertType
  threshold Int         @default(70) // score minimum pour déclencher
  channel   AlertChannel @default(EMAIL)
  isActive  Boolean     @default(true)
  lastSentAt DateTime?
  createdAt DateTime    @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum AlertType {
  SCORE_THRESHOLD   // déclenche quand score > threshold
  DAILY_DIGEST      // résumé quotidien
  SPIKE             // pic soudain (+200% en 24h)
}

enum AlertChannel {
  EMAIL
  WEBHOOK
}

// ─────────────────────────────────────────
// TOKENS API (pour l'extension Chrome)
// ─────────────────────────────────────────

model ApiToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique @default(cuid())
  name      String   @default("Extension Chrome")
  lastUsedAt DateTime?
  expiresAt DateTime?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### 2.3 Variables d'environnement PostgreSQL

Dans `.env.local` :
```env
# PostgreSQL (votre provider existant)
DATABASE_URL="postgresql://user:password@host:5432/trendhunter"
DIRECT_URL="postgresql://user:password@host:5432/trendhunter"
```

### 2.4 Générer et pousser le schéma

```bash
npx prisma generate
npx prisma db push
# OU pour les migrations de prod :
npx prisma migrate dev --name init
```

---

## Phase 3 — Authentification (NextAuth.js v5 + Google)

### 3.1 Variables d'environnement Auth

```env
# NextAuth
AUTH_SECRET="générer avec : openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"

# Google OAuth — créer sur console.cloud.google.com
# Authorized redirect URIs : http://localhost:3000/api/auth/callback/google
AUTH_GOOGLE_ID="xxxx.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-xxxx"
```

### 3.2 Configuration NextAuth

Fichier : `src/lib/auth.ts`

```typescript
import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        // Charger le plan depuis Stripe/Subscription
        const subscription = await prisma.subscription.findUnique({
          where: { userId: user.id },
        })
        session.user.plan = subscription?.plan ?? "FREE"
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})
```

### 3.3 Route handler Auth

Fichier : `src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

### 3.4 Middleware de protection des routes

Fichier : `src/middleware.ts`

```typescript
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard") ||
                        req.nextUrl.pathname.startsWith("/niches") ||
                        req.nextUrl.pathname.startsWith("/alerts") ||
                        req.nextUrl.pathname.startsWith("/billing")

  if (isOnDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  if (isLoggedIn && req.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl))
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
```

### 3.5 Étendre le type Session

Fichier : `src/types/index.ts`

```typescript
import { Plan } from "@prisma/client"
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      plan: Plan
    } & DefaultSession["user"]
  }
}
```

### 3.6 Page de login

Fichier : `src/app/(auth)/login/page.tsx`

```typescript
import { signIn } from "@/lib/auth"

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-2xl">
        <div>
          <h1 className="text-2xl font-semibold">Connexion</h1>
          <p className="text-sm text-gray-500 mt-1">
            Continuez avec votre compte Google
          </p>
        </div>
        <form
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: "/dashboard" })
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            <GoogleIcon />
            Continuer avec Google
          </button>
        </form>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      {/* SVG Google icon paths */}
    </svg>
  )
}
```

---

## Phase 4 — Stripe (Abonnements)

### 4.1 Variables d'environnement Stripe

```env
# Stripe — dashboard.stripe.com
STRIPE_SECRET_KEY="sk_test_xxxx"
STRIPE_PUBLISHABLE_KEY="pk_test_xxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxx"  # généré via Stripe CLI

# IDs des produits Stripe (créer dans le dashboard)
STRIPE_PRO_PRICE_ID="price_xxxx"    # 15€/mois
STRIPE_TEAM_PRICE_ID="price_xxxx"   # 39€/mois
```

### 4.2 Client Stripe

Fichier : `src/lib/stripe.ts`

```typescript
import Stripe from "stripe"

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
})
```

### 4.3 Route — Créer une session Checkout

Fichier : `src/app/api/stripe/checkout/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const { priceId } = await req.json()

  // Récupérer ou créer le customer Stripe
  let stripeCustomerId = session.user.stripeCustomerId

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: session.user.email!,
      name: session.user.name ?? undefined,
      metadata: { userId: session.user.id },
    })
    stripeCustomerId = customer.id

    await prisma.user.update({
      where: { id: session.user.id },
      data: { stripeCustomerId },
    })
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    billing_address_collection: "required",
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
    subscription_data: {
      metadata: { userId: session.user.id },
    },
  })

  return NextResponse.json({ url: checkoutSession.url })
}
```

### 4.4 Route — Customer Portal (gérer l'abonnement)

Fichier : `src/app/api/stripe/portal/route.ts`

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  })

  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "Aucun abonnement" }, { status: 400 })
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.NEXTAUTH_URL}/billing`,
  })

  return NextResponse.json({ url: portalSession.url })
}
```

### 4.5 Route — Webhook Stripe (CRITIQUE)

Fichier : `src/app/api/stripe/webhook/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

// IMPORTANT : désactiver le body parser pour les webhooks
export const config = { api: { bodyParser: false } }

function getPlanFromPriceId(priceId: string) {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO" as const
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return "TEAM" as const
  return "FREE" as const
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: "Webhook invalide" }, { status: 400 })
  }

  const subscription = event.data.object as Stripe.Subscription

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object as Stripe.CheckoutSession
      if (checkoutSession.mode !== "subscription") break

      const sub = await stripe.subscriptions.retrieve(checkoutSession.subscription as string)
      const userId = sub.metadata.userId

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeSubscriptionId: sub.id,
          stripePriceId: sub.items.data[0].price.id,
          stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
          plan: getPlanFromPriceId(sub.items.data[0].price.id),
          status: "ACTIVE",
        },
        update: {
          stripePriceId: sub.items.data[0].price.id,
          stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
          plan: getPlanFromPriceId(sub.items.data[0].price.id),
          status: "ACTIVE",
        },
      })
      break
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice
      if (!invoice.subscription) break

      const sub = await stripe.subscriptions.retrieve(invoice.subscription as string)
      const userId = sub.metadata.userId

      await prisma.subscription.update({
        where: { userId },
        data: {
          stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
          status: "ACTIVE",
        },
      })
      break
    }

    case "customer.subscription.updated": {
      const userId = subscription.metadata.userId

      await prisma.subscription.update({
        where: { userId },
        data: {
          stripePriceId: subscription.items.data[0].price.id,
          plan: getPlanFromPriceId(subscription.items.data[0].price.id),
          status: subscription.status.toUpperCase() as any,
          stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
        },
      })
      break
    }

    case "customer.subscription.deleted": {
      const userId = subscription.metadata.userId

      await prisma.subscription.update({
        where: { userId },
        data: { status: "CANCELED", plan: "FREE" },
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
```

### 4.6 Tester les webhooks en local

```bash
# Installer Stripe CLI
brew install stripe/stripe-cli/stripe

# Authentifier
stripe login

# Forwarder les webhooks vers localhost
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## Phase 5 — API des tendances

### 5.1 Clients IA et cache

Fichier : `src/lib/anthropic.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk"

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})
```

Fichier : `src/lib/redis.ts`

```typescript
import { Redis } from "@upstash/redis"

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
```

Variables à ajouter :
```env
ANTHROPIC_API_KEY="sk-ant-xxxx"
UPSTASH_REDIS_REST_URL="https://xxxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="xxxx"
YOUTUBE_API_KEY="AIzaxxx"  # Google Cloud Console
```

### 5.2 Helper — Vérifier le plan de l'utilisateur

Fichier : `src/lib/plan-check.ts`

```typescript
import { prisma } from "@/lib/prisma"

export async function getUserPlan(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true, stripeCurrentPeriodEnd: true },
  })

  if (!sub || sub.status === "CANCELED") return "FREE"
  if (sub.stripeCurrentPeriodEnd < new Date()) return "FREE"
  return sub.plan
}

export const PLAN_LIMITS = {
  FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false },
  PRO:  { niches: -1, trendsPerNiche: -1, alerts: true, export: true },
  TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true },
}
```

### 5.3 Route GET /api/trends

Fichier : `src/app/api/trends/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const nicheSlug = req.nextUrl.searchParams.get("niche")
  if (!nicheSlug) {
    return NextResponse.json({ error: "Niche requise" }, { status: 400 })
  }

  const plan = await getUserPlan(session.user.id)
  const limits = PLAN_LIMITS[plan]

  // Vérifier l'accès à la niche
  const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } })
  if (!niche) return NextResponse.json({ error: "Niche introuvable" }, { status: 404 })

  if (plan === "FREE") {
    const userNiches = await prisma.userNiche.count({
      where: { userId: session.user.id },
    })
    if (userNiches > 1) {
      return NextResponse.json({ error: "Limite plan Free atteinte" }, { status: 403 })
    }
  }

  // Cache Redis : clé par niche, TTL 1h
  const cacheKey = `trends:${nicheSlug}`
  const cached = await redis.get(cacheKey)
  if (cached) {
    const trends = cached as any[]
    const limited = plan === "FREE" ? trends.slice(0, limits.trendsPerNiche) : trends
    return NextResponse.json({ trends: limited, fromCache: true })
  }

  // Depuis la DB
  const trends = await prisma.trend.findMany({
    where: {
      nicheId: niche.id,
      expiresAt: { gte: new Date() },
    },
    orderBy: { score: "desc" },
    take: 20,
  })

  await redis.set(cacheKey, JSON.stringify(trends), { ex: 3600 })

  const limited = plan === "FREE" ? trends.slice(0, limits.trendsPerNiche) : trends
  return NextResponse.json({ trends: limited, plan })
}
```

### 5.4 Service — Score IA d'une tendance

Fichier : `src/lib/trend-scorer.ts`

```typescript
import { anthropic } from "@/lib/anthropic"

interface TrendInput {
  title: string
  searchVolume: number
  videoCount: number
  avgViews: number
  velocityPercent: number
  niche: string
  language: string
}

interface TrendScore {
  score: number
  status: "EMERGING" | "GROWING" | "PEAK" | "FADING"
  contentAngles: string[]
  reasoning: string
}

export async function scoreTrend(input: TrendInput): Promise<TrendScore> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Tu es un expert en stratégie de contenu YouTube.

Évalue cette tendance émergente et retourne UNIQUEMENT un JSON valide, sans markdown.

Tendance : "${input.title}"
Niche : ${input.niche}
Langue cible : ${input.language}
Volume de recherche mensuel : ${input.searchVolume}
Nombre de vidéos existantes : ${input.videoCount}
Vues moyennes par vidéo : ${input.avgViews}
Croissance sur 48h : +${input.velocityPercent}%

Retourne ce JSON exact :
{
  "score": <entier 0-100>,
  "status": <"EMERGING"|"GROWING"|"PEAK"|"FADING">,
  "contentAngles": [<3 angles de vidéo courts et percutants>],
  "reasoning": <une phrase expliquant le score>
}

Critères de score :
- 0-49 : tendance faible ou saturée
- 50-74 : opportunité interessante
- 75-100 : fenêtre d'opportunité rare, agir vite`,
      },
    ],
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""
  return JSON.parse(text) as TrendScore
}
```

---

## Phase 6 — API pour l'Extension Chrome

L'extension s'authentifie via un token API (pas de session cookie), géré dans la page Billing du dashboard.

### 6.1 Route — Générer un token pour l'extension

Fichier : `src/app/api/extension/auth/route.ts`

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  // Supprimer les anciens tokens
  await prisma.apiToken.deleteMany({
    where: { userId: session.user.id },
  })

  const token = await prisma.apiToken.create({
    data: {
      userId: session.user.id,
      token: randomUUID(),
      name: "Extension Chrome",
    },
  })

  return NextResponse.json({ token: token.token })
}
```

### 6.2 Route — Tendances pour l'extension (auth par token)

Fichier : `src/app/api/extension/trends/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const token = authHeader?.replace("Bearer ", "")

  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 })
  }

  const apiToken = await prisma.apiToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!apiToken) {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 })
  }

  // Mettre à jour lastUsedAt
  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  })

  const nicheSlug = req.nextUrl.searchParams.get("niche") ?? "tech"
  const plan = await getUserPlan(apiToken.userId)
  const limits = PLAN_LIMITS[plan]

  const cacheKey = `trends:${nicheSlug}`
  const cached = await redis.get(cacheKey)

  if (cached) {
    const trends = cached as any[]
    return NextResponse.json({
      trends: plan === "FREE" ? trends.slice(0, 5) : trends,
      plan,
      user: { name: apiToken.user.name, email: apiToken.user.email },
    })
  }

  const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } })
  if (!niche) return NextResponse.json({ trends: [], plan })

  const trends = await prisma.trend.findMany({
    where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
    orderBy: { score: "desc" },
    take: 20,
  })

  await redis.set(cacheKey, JSON.stringify(trends), { ex: 3600 })

  return NextResponse.json({
    trends: plan === "FREE" ? trends.slice(0, 5) : trends,
    plan,
  })
}
```

---

## Phase 7 — Extension Chrome (Manifest V3)

### 7.1 manifest.json

Fichier : `extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "TrendHunter — Veille YouTube IA",
  "version": "1.0.0",
  "description": "Détectez les tendances YouTube émergentes avant vos concurrents.",
  "permissions": [
    "storage",
    "activeTab",
    "sidePanel"
  ],
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://trendhunter.app/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "side_panel": {
    "default_path": "sidebar/index.html"
  },
  "action": {
    "default_title": "TrendHunter",
    "default_popup": "sidebar/index.html"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 7.2 background.js (Service Worker)

Fichier : `extension/background.js`

```javascript
const API_BASE = "https://trendhunter.app"

// Ouvrir le side panel au clic sur l'icône
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId })
})

// Activer le side panel sur YouTube uniquement
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url?.includes("youtube.com")) {
    chrome.sidePanel.setOptions({ tabId, path: "sidebar/index.html", enabled: true })
  } else {
    chrome.sidePanel.setOptions({ tabId, enabled: false })
  }
})

// Écouter les messages du content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TRENDS") {
    chrome.storage.local.get(["apiToken", "selectedNiche"], async ({ apiToken, selectedNiche }) => {
      if (!apiToken) {
        sendResponse({ error: "NOT_AUTHENTICATED" })
        return
      }

      try {
        const res = await fetch(
          `${API_BASE}/api/extension/trends?niche=${selectedNiche ?? "tech"}`,
          {
            headers: { Authorization: `Bearer ${apiToken}` },
          }
        )
        const data = await res.json()
        sendResponse({ data })
      } catch (err) {
        sendResponse({ error: "FETCH_ERROR" })
      }
    })
    return true // async response
  }
})
```

### 7.3 sidebar/index.html

Fichier : `extension/sidebar/index.html`

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrendHunter</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <!-- Auth screen -->
    <div id="screen-auth" class="screen">
      <div class="logo-row">
        <span class="logo-dot"></span>
        <span class="logo-text">TrendHunter</span>
      </div>
      <p class="subtitle">Connectez votre compte pour accéder aux tendances</p>
      <input type="text" id="token-input" placeholder="Collez votre token API" />
      <button id="btn-connect" class="btn-primary">Connecter</button>
      <a href="https://trendhunter.app/billing" target="_blank" class="link">
        Obtenir un token →
      </a>
    </div>

    <!-- Main screen -->
    <div id="screen-main" class="screen hidden">
      <div class="topbar">
        <div class="logo-row">
          <span class="logo-dot"></span>
          <span class="logo-text">TrendHunter</span>
        </div>
        <select id="niche-select">
          <option value="finance">Finance</option>
          <option value="tech">Tech & IA</option>
          <option value="fitness">Fitness</option>
          <option value="cuisine">Cuisine</option>
        </select>
      </div>

      <div id="plan-badge" class="badge-free">Plan Free</div>

      <div id="trends-list"></div>

      <div id="upgrade-banner" class="hidden">
        <p>Passez Pro pour voir toutes les tendances</p>
        <a href="https://trendhunter.app/pricing" target="_blank" class="btn-upgrade">
          Passer Pro →
        </a>
      </div>

      <button id="btn-logout" class="btn-ghost">Déconnecter</button>
    </div>

    <!-- Loading -->
    <div id="screen-loading" class="screen hidden">
      <div class="spinner"></div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

### 7.4 sidebar/app.js

Fichier : `extension/sidebar/app.js`

```javascript
// ─── Init ───────────────────────────────
async function init() {
  showScreen("loading")
  const { apiToken } = await chrome.storage.local.get("apiToken")

  if (!apiToken) {
    showScreen("auth")
    return
  }

  await loadTrends()
}

// ─── Auth ────────────────────────────────
document.getElementById("btn-connect").addEventListener("click", async () => {
  const token = document.getElementById("token-input").value.trim()
  if (!token) return

  await chrome.storage.local.set({ apiToken: token })
  await loadTrends()
})

document.getElementById("btn-logout").addEventListener("click", async () => {
  await chrome.storage.local.remove("apiToken")
  showScreen("auth")
})

// ─── Niche switch ────────────────────────
document.getElementById("niche-select").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ selectedNiche: e.target.value })
  await loadTrends()
})

// ─── Load trends ─────────────────────────
async function loadTrends() {
  showScreen("loading")

  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_TRENDS" }, resolve)
  })

  if (response.error === "NOT_AUTHENTICATED") {
    showScreen("auth")
    return
  }

  if (response.error) {
    showError("Erreur de connexion. Réessayez.")
    return
  }

  const { trends, plan } = response.data
  renderTrends(trends, plan)
  showScreen("main")
}

// ─── Render ──────────────────────────────
function renderTrends(trends, plan) {
  const badge = document.getElementById("plan-badge")
  badge.textContent = `Plan ${plan}`
  badge.className = plan === "FREE" ? "badge-free" : "badge-pro"

  const upgradeBanner = document.getElementById("upgrade-banner")
  upgradeBanner.classList.toggle("hidden", plan !== "FREE")

  const list = document.getElementById("trends-list")
  list.innerHTML = trends.map((t) => `
    <div class="trend-card ${t.score >= 75 ? "trend-hot" : ""}">
      <div class="trend-score ${scoreClass(t.score)}">${t.score}</div>
      <div class="trend-content">
        <div class="trend-title">${t.title}</div>
        <div class="trend-meta">${t.videoCount ?? "?"} vidéos · +${Math.round(t.velocity)}%</div>
        ${t.contentAngles?.length
          ? `<div class="trend-angles">
              ${t.contentAngles.slice(0, 2).map(a => `<div class="angle">→ ${a}</div>`).join("")}
            </div>`
          : ""}
      </div>
    </div>
  `).join("")
}

function scoreClass(score) {
  if (score >= 75) return "score-hot"
  if (score >= 50) return "score-mid"
  return "score-low"
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"))
  document.getElementById(`screen-${name}`)?.classList.remove("hidden")
}

function showError(msg) {
  showScreen("main")
  document.getElementById("trends-list").innerHTML = `<div class="error">${msg}</div>`
}

// ─── Start ───────────────────────────────
init()
```

### 7.5 Style CSS pour l'extension

Fichier : `extension/sidebar/style.css`

```css
/* Reset */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1f2937;
  background: #f9fafb;
  min-height: 100vh;
}

#app {
  padding: 16px;
}

/* Screens */
.screen {
  display: block;
}

.screen.hidden {
  display: none;
}

/* Auth screen */
#screen-auth {
  text-align: center;
  padding: 48px 16px;
}

.logo-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}

.logo-dot {
  width: 32px;
  height: 32px;
  background: #2563eb;
  border-radius: 8px;
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
}

.subtitle {
  color: #6b7280;
  margin-bottom: 24px;
}

#token-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 12px;
}

#token-input:focus {
  outline: none;
  border-color: #2563eb;
  ring: 2px solid #2563eb;
}

.btn-primary {
  width: 100%;
  padding: 12px;
  background: #111827;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover {
  background: #1f2937;
}

.link {
  display: block;
  margin-top: 16px;
  color: #2563eb;
  font-size: 14px;
}

/* Main screen */
#screen-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#niche-select {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  font-size: 14px;
}

.badge-free {
  display: inline-block;
  padding: 4px 8px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}

.badge-pro {
  display: inline-block;
  padding: 4px 8px;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}

/* Trending list */
#trends-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trend-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}

.trend-card.trend-hot {
  border-color: #fca5a5;
  background: #fef2f2;
}

.trend-score {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.trend-score.score-hot {
  background: #dc2626;
}

.trend-score.score-mid {
  background: #f59e0b;
}

.trend-score.score-low {
  background: #22c55e;
}

.trend-content {
  flex: 1;
  min-width: 0;
}

.trend-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trend-meta {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

.trend-angles {
  margin-top: 8px;
}

.angle {
  font-size: 12px;
  color: #4b5563;
  margin-top: 4px;
}

/* Upgrade banner */
#upgrade-banner {
  padding: 12px;
  background: #fef3c7;
  border-radius: 8px;
  text-align: center;
}

#upgrade-banner p {
  font-size: 14px;
  color: #92400e;
  margin-bottom: 8px;
}

.btn-upgrade {
  display: inline-block;
  padding: 8px 16px;
  background: #2563eb;
  color: white;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}

.btn-ghost {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
}

.btn-ghost:hover {
  background: #f3f4f6;
}

/* Loading */
.spinner {
  width: 32px;
  height: 32px;
  margin: 48px auto;
  border: 3px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Error */
.error {
  padding: 16px;
  background: #fef2f2;
  color: #dc2626;
  border-radius: 8px;
  text-align: center;
}
```

---

## Phase 8 — Pages du dashboard Next.js

### 8.1 Layout dashboard

Fichier : `src/app/(dashboard)/layout.tsx`

```typescript
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/dashboard/Sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex h-screen">
      <Sidebar user={session.user} />
      <main className="flex-1 overflow-auto bg-gray-50 p-8">
        {children}
      </main>
    </div>
  )
}
```

### 8.2 Composants UI dashboard

#### 8.2.1 Sidebar

Fichier : `src/components/dashboard/sidebar.tsx`

```typescript
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, TrendingUp, Bell, CreditCard, Target } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Tendances", icon: LayoutDashboard },
  { href: "/niches", label: "Niches", icon: Target },
  { href: "/alerts", label: "Alertes", icon: Bell },
  { href: "/billing", label: "Facturation", icon: CreditCard },
]

export function Sidebar({ user }: { user: { name?: string | null; image?: string | null } }) {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white border-r px-4 py-6">
      <div className="mb-8">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          TrendHunter
        </h1>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-black text-white"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="absolute bottom-4 left-4 right-4">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-gray-300 overflow-hidden">
            {user.image && (
              <img src={user.image} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
```

#### 8.2.2 TrendCard

Fichier : `src/components/dashboard/trend-card.tsx`

```typescript
import { TrendingUp, TrendingDown, Minus, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface TrendCardProps {
  trend: {
    id: string
    title: string
    description?: string | null
    score: number
    velocity: number
    status: string
    contentAngles?: string[] | null
    videoCount?: number | null
  }
}

export function TrendCard({ trend }: TrendCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "PEAK": return "bg-red-500"
      case "GROWING": return "bg-yellow-500"
      case "FADING": return "bg-gray-500"
      default: return "bg-green-500"
    }
  }

  const getVelocityIcon = () => {
    if (trend.velocity > 0) return <TrendingUp className="w-4 h-4" />
    if (trend.velocity < 0) return <TrendingDown className="w-4 h-4" />
    return <Minus className="w-4 h-4" />
  }

  return (
    <div className="bg-white p-4 rounded-xl border hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white ${getStatusColor(trend.status)}`}
        >
          {trend.score}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{trend.title}</h3>
          {trend.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{trend.description}</p>
          )}

          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              {getVelocityIcon()}
              {Math.abs(trend.velocity).toFixed(1)}%
            </span>
            {trend.videoCount && (
              <span>{trend.videoCount} vidéos</span>
            )}
          </div>

          {trend.contentAngles && trend.contentAngles.length > 0 && (
            <div className="mt-3 space-y-1">
              {trend.contentAngles.slice(0, 2).map((angle, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Play className="w-3 h-3 mt-1 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-600">{angle}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Badge variant={trend.score >= 75 ? "destructive" : trend.score >= 50 ? "default" : "secondary"}>
          {trend.status}
        </Badge>
      </div>
    </div>
  )
}
```

#### 8.2.3 NicheSelector

Fichier : `src/components/dashboard/niche-selector.tsx`

```typescript
"use client"

import { useRouter, useSearchParams } from "next/navigation"

interface NicheSelectorProps {
  niches: { slug: string; name: string }[]
  current: string
}

export function NicheSelector({ niches, current }: NicheSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("niche", e.target.value)
    router.push(`/dashboard?${params.toString()}`)
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      className="px-4 py-2 border rounded-lg bg-white text-sm font-medium"
    >
      {niches.map((niche) => (
        <option key={niche.slug} value={niche.slug}>
          {niche.name}
        </option>
      ))}
    </select>
  )
}
```

#### 8.2.4 AlertForm

Fichier : `src/components/dashboard/alert-form.tsx`

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface AlertFormProps {
  niches: { id: string; slug: string; name: string }[]
  onSubmit: (data: AlertFormData) => Promise<void>
}

interface AlertFormData {
  nicheId?: string
  type: "SCORE_THRESHOLD" | "DAILY_DIGEST" | "SPIKE"
  threshold: number
  channel: "EMAIL" | "WEBHOOK"
}

export function AlertForm({ niches, onSubmit }: AlertFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState<AlertFormData>({
    type: "SCORE_THRESHOLD",
    threshold: 70,
    channel: "EMAIL",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await onSubmit(formData)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Niche (optionnel)</label>
        <select
          value={formData.nicheId || ""}
          onChange={(e) => setFormData({ ...formData, nicheId: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="">Toutes les niches</option>
          {niches.map((niche) => (
            <option key={niche.id} value={niche.id}>
              {niche.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Type d'alerte</label>
        <select
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="SCORE_THRESHOLD">Seuil de score</option>
          <option value="DAILY_DIGEST">Résumé quotidien</option>
          <option value="SPIKE">Pic soudain</option>
        </select>
      </div>

      {formData.type === "SCORE_THRESHOLD" && (
        <div>
          <label className="block text-sm font-medium mb-1">Score minimum</label>
          <Input
            type="number"
            min={0}
            max={100}
            value={formData.threshold}
            onChange={(e) => setFormData({ ...formData, threshold: parseInt(e.target.value) })}
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Canal</label>
        <select
          value={formData.channel}
          onChange={(e) => setFormData({ ...formData, channel: e.target.value as any })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="EMAIL">Email</option>
          <option value="WEBHOOK">Webhook</option>
        </select>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? "Création..." : "Créer l'alerte"}
      </Button>
    </form>
  )
}
```

#### 8.2.5 Composants UI de base

Fichier : `src/components/ui/button.tsx`

```typescript
import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          {
            default: "bg-black text-white hover:bg-gray-800",
            destructive: "bg-red-500 text-white hover:bg-red-600",
            outline: "border border-gray-300 hover:bg-gray-100",
            ghost: "hover:bg-gray-100",
            link: "text-black underline-offset-4 hover:underline",
          }[variant],
          {
            default: "h-10 px-4 py-2",
            sm: "h-9 rounded-md px-3",
            lg: "h-11 rounded-md px-8",
            icon: "h-10 w-10",
          }[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
```

Fichier : `src/components/ui/input.tsx`

```typescript
import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
```

Fichier : `src/components/ui/badge.tsx`

```typescript
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-gray-900 text-white",
        secondary: "border-transparent bg-gray-100 text-gray-900",
        destructive: "border-transparent bg-red-500 text-white",
        outline: "text-gray-950",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
```

#### 8.2.6 ManageSubscriptionButton (Client Component)

Fichier : `src/components/dashboard/manage-subscription-button.tsx`

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function ManageSubscriptionButton() {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={isLoading} variant="outline">
      {isLoading ? "Chargement..." : "Gérer l'abonnement"}
    </Button>
  )
}
```

#### 8.2.7 GenerateTokenButton (Client Component)

Fichier : `src/components/dashboard/generate-token-button.tsx`

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function GenerateTokenButton() {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/extension/auth", { method: "POST" })
      const data = await res.json()
      if (data.token) {
        await navigator.clipboard.writeText(data.token)
        alert("Token copié dans le presse-papiers !")
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={isLoading} variant="outline">
      {isLoading ? "Génération..." : "Générer un nouveau token"}
    </Button>
  )
}
```

Fichier : `src/app/(dashboard)/dashboard/page.tsx`

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan } from "@/lib/plan-check"
import { TrendCard } from "@/components/dashboard/TrendCard"
import { NicheSelector } from "@/components/dashboard/NicheSelector"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { niche?: string }
}) {
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)
  const nicheSlug = searchParams.niche ?? "tech"

  const niche = await prisma.niche.findUnique({
    where: { slug: nicheSlug },
  })

  const trends = niche
    ? await prisma.trend.findMany({
        where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
        orderBy: { score: "desc" },
        take: plan === "FREE" ? 5 : 20,
      })
    : []

  const niches = await prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Tendances</h1>
        <NicheSelector niches={niches} current={nicheSlug} />
      </div>

      {plan === "FREE" && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          Plan Free : 5 tendances visibles. <a href="/pricing" className="underline font-medium">Passer Pro →</a>
        </div>
      )}

      <div className="space-y-3">
        {trends.map((trend) => (
          <TrendCard key={trend.id} trend={trend} />
        ))}
      </div>
    </div>
  )
}
```

### 8.3 Page Billing

Fichier : `src/app/(dashboard)/billing/page.tsx`

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan } from "@/lib/plan-check"
import { ManageSubscriptionButton } from "@/components/dashboard/ManageSubscriptionButton"
import { GenerateTokenButton } from "@/components/dashboard/GenerateTokenButton"

export default async function BillingPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)

  const apiToken = await prisma.apiToken.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Facturation</h1>

      {/* Plan actuel */}
      <div className="p-6 border rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Plan actuel</p>
            <p className="text-xl font-semibold capitalize">{plan.toLowerCase()}</p>
          </div>
          {plan !== "FREE" && <ManageSubscriptionButton />}
          {plan === "FREE" && (
            <a href="/pricing" className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium">
              Passer Pro
            </a>
          )}
        </div>
      </div>

      {/* Token API extension */}
      <div className="p-6 border rounded-2xl">
        <h2 className="font-semibold mb-1">Token API — Extension Chrome</h2>
        <p className="text-sm text-gray-500 mb-4">
          Utilisez ce token pour connecter l'extension TrendHunter à votre compte.
        </p>
        {apiToken && (
          <div className="mb-3 flex items-center gap-2">
            <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono text-gray-800 truncate">
              {apiToken.token}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(apiToken.token)}
              className="px-3 py-2 border rounded text-sm"
            >
              Copier
            </button>
          </div>
        )}
        <GenerateTokenButton />
      </div>
    </div>
  )
}
```
---

### 8.4 Page /pricing (Site Marketing)

Fichier : `src/app/(marketing)/pricing/page.tsx`

```typescript
import Link from "next/link"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"

const plans = [
  {
    name: "Free",
    price: "0€",
    period: "/mois",
    description: "Pour découvrir TrendHunter",
    features: [
      "1 niche suivie",
      "5 tendances par niche",
      "Access extension Chrome",
      "Support par email",
    ],
    cta: "Commencer gratuit",
    href: "/login",
    popular: false,
  },
  {
    name: "Pro",
    price: "15€",
    period: "/mois",
    description: "Pour les créateurs de contenu",
    features: [
      "Toutes les niches",
      "Tendances illimitées",
      "Alertes en temps réel",
      "Angles de contenu IA",
      "Export CSV",
      "Support prioritaire",
    ],
    cta: "Passer Pro",
    href: "/login?plan=pro",
    popular: true,
  },
  {
    name: "Team",
    price: "39€",
    period: "/mois",
    description: "Pour les équipes",
    features: [
      "Tout Pro",
      "5 utilisateurs",
      "API access",
      "Webhooks",
      "Account manager dédié",
    ],
    cta: "Contact commercial",
    href: "mailto:contact@trendhunter.app",
    popular: false,
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">Tarifs</h1>
          <p className="text-xl text-gray-600">
           Choisissez le plan qui correspond à vos besoins
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`bg-white rounded-2xl p-8 ${
                plan.popular ? "ring-2 ring-black scale-105" : "border"
              }`}
            >
              {plan.popular && (
                <span className="bg-black text-white text-xs font-medium px-2 py-1 rounded-full">
                  Populaire
                </span>
              )}

              <h2 className="text-2xl font-bold mt-4">{plan.name}</h2>
              <div className="mt-4">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-gray-500">{plan.period}</span>
              </div>
              <p className="text-gray-500 mt-2">{plan.description}</p>

              <ul className="mt-8 space-y-4">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full mt-8"
                variant={plan.popular ? "default" : "outline"}
                asChild={!!plan.href}
              >
                {plan.href ? (
                  <Link href={plan.href}>{plan.cta}</Link>
                ) : (
                  <span>{plan.cta}</span>
                )}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

### 8.5 Page /niches (Dashboard)

Fichier : `src/app/(dashboard)/niches/page.tsx`

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan } from "@/lib/plan-check"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"

export default async function NichesPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)

  const allNiches = await prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      userNiches: {
        where: { userId: session.user.id },
      },
      _count: {
        select: { trends: true },
      },
    },
  })

  const userNiches = await prisma.userNiche.findMany({
    where: { userId: session.user.id },
    include: { niche: true },
  })

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Niches</h1>
          <p className="text-gray-500 mt-1">
            Suivez les niches qui vous intéressent
          </p>
        </div>

        <form action={async () => {
          "use server"
          // Ajouter une niche non suivie
        }}>
          <Button type="submit">
            <Plus className="w-4 h-4 mr-2" />
            Suivre une niche
          </Button>
        </form>
      </div>

      {/* Niches suivies */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-gray-500 mb-4">
          Vos niches ({userNiches.length})
        </h2>
        <div className="space-y-3">
          {userNiches.map(({ niche }) => (
            <div
              key={niche.id}
              className="flex items-center justify-between p-4 bg-white rounded-xl border"
            >
              <div>
                <h3 className="font-medium">{niche.name}</h3>
                <p className="text-sm text-gray-500">{niche.keywords?.join(", ")}</p>
              </div>
              <form
                action={async () => {
                  "use server"
                  // Retirer la niche
                }}
              >
                <Button variant="ghost" size="icon">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </form>
            </div>
          ))}

          {userNiches.length === 0 && (
            <p className="text-gray-500 text-center py-8">
              Vous ne suivez aucune niche pour le moment
            </p>
          )}
        </div>
      </div>

      {/* Toutes les niches disponibles */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-4">
          Niches disponibles ({allNiches.length})
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {allNiches.map((niche) => {
            const isFollowed = niche.userNiches.length > 0
            return (
              <div
                key={niche.id}
                className="flex items-center justify-between p-4 bg-white rounded-xl border"
              >
                <div>
                  <h3 className="font-medium">{niche.name}</h3>
                  <p className="text-sm text-gray-500">
                    {niche._count.trends} tendances
                  </p>
                </div>
                {isFollowed ? (
                  <span className="text-sm text-green-600">Suivi</span>
                ) : (
                  <form
                    action={async () => {
                      "use server"
                      // Suivre la niche
                    }}
                  >
                    <Button variant="outline" size="sm">
                      Suivre
                    </Button>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

### 8.6 Page /alerts (Dashboard)

Fichier : `src/app/(dashboard)/alerts/page.tsx`

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check"
import { AlertForm } from "@/components/dashboard/alert-form"
import { Button } from "@/components/ui/button"
import { Bell, Trash2, Mail, Webhook } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

export default async function AlertsPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)
  const limits = PLAN_LIMITS[plan]

  const alerts = await prisma.alert.findMany({
    where: { userId: session.user.id },
    include: { niche: true },
    orderBy: { createdAt: "desc" },
  })

  const niches = await prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })

  const canCreateAlert = plan !== "FREE" || limits.alerts

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Alertes</h1>
          <p className="text-gray-500 mt-1">
            Recevez des notifications quand les tendances changent
          </p>
        </div>
      </div>

      {!canCreateAlert && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          Les alertes sont disponibles à partir du plan Pro.{" "}
          <a href="/pricing" className="underline font-medium">
            Passer Pro →
          </a>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Liste des alertes */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-4">
            Vos alertes ({alerts.length})
          </h2>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-4 bg-white rounded-xl border"
              >
                <div>
                  <div className="flex items-center gap-2">
                    {alert.channel === "EMAIL" ? (
                      <Mail className="w-4 h-4 text-gray-400" />
                    ) : (
                      <Webhook className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="font-medium">{alert.type}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {alert.niche?.name || "Toutes les niches"}
                    {alert.type === "SCORE_THRESHOLD" && ` > ${alert.threshold}`}
                  </p>
                  {alert.lastSentAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      Dernier envoi :{" "}
                      {formatDistanceToNow(alert.lastSentAt, { addSuffix: true, locale: fr })}
                    </p>
                  )}
                </div>

                <form
                  action={async () => {
                    "use server"
                    // Supprimer l'alerte
                  }}
                >
                  <Button variant="ghost" size="icon">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            ))}

            {alerts.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p>Aucune alerte configurée</p>
              </div>
            )}
          </div>
        </div>

        {/* Créer une alerte */}
        {canCreateAlert && (
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-medium mb-4">Créer une alerte</h2>
            <AlertForm
              niches={niches}
              onSubmit={async (data) => {
                "use server"
                // Créer l'alerte
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
```

### 8.7 Landing page (marketing)

Fichier : `src/app/(marketing)/page.tsx`

```typescript
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { TrendingUp, Zap, Bell, BarChart3 } from "lucide-react"

const features = [
  {
    icon: TrendingUp,
    title: "Tendances en temps réel",
    description: "Détectez les sujets qui montent avant vos concurrents",
  },
  {
    icon: Zap,
    title: "Score IA",
    description: "Évaluez le potentiel de chaque tendance avec notre IA",
  },
  {
    icon: Bell,
    title: "Alertes personnalisées",
    description: "Soyez notifié quand une opportunité se présente",
  },
  {
    icon: BarChart3,
    title: "Extension Chrome",
    description: "Accédez aux tendances directement depuis YouTube",
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            TrendHunter
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm font-medium">
              Tarifs
            </Link>
            <Link href="/login">
              <Button variant="outline">Connexion</Button>
            </Link>
            <Link href="/login">
              <Button>Commencer</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-6">
            Trouvez les tendances YouTube
            <br />
            <span className="text-blue-600">avant qu'il ne soit trop tard</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            TrendHunter analyse des milliers de données pour identifier les tendances
            émergentes et vous proposer des angles de vidéo à fort potentiel.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg">Essayer gratuitement</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg">
                Voir les tarifs
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            Tout ce dont vous avez besoin
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.title} className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-medium mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          © 2024 TrendHunter. Tous droits réservés.
        </div>
      </footer>
    </div>
  )
}
```

---

## Phase 9 — Seed de la base de données

Fichier : `prisma/seed.ts`

```typescript
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const niches = [
    {
      slug: "finance-personnelle",
      name: "Finance personnelle",
      keywords: ["budget", "épargne", "investissement", "retraite", "finances perso"],
      language: "fr",
    },
    {
      slug: "tech-ia",
      name: "Tech & IA",
      keywords: ["intelligence artificielle", "LLM", "agents IA", "programmation", "no-code"],
      language: "fr",
    },
    {
      slug: "fitness",
      name: "Fitness",
      keywords: ["musculation", "perte de poids", "cardio", "nutrition sportive", "programme"],
      language: "fr",
    },
    {
      slug: "cuisine",
      name: "Cuisine",
      keywords: ["recettes", "batch cooking", "régime", "pâtisserie", "végétarien"],
      language: "fr",
    },
    {
      slug: "business-en-ligne",
      name: "Business en ligne",
      keywords: ["dropshipping", "freelance", "side hustle", "e-commerce", "revenus passifs"],
      language: "fr",
    },
  ]

  for (const niche of niches) {
    await prisma.niche.upsert({
      where: { slug: niche.slug },
      update: niche,
      create: niche,
    })
  }

  console.log("✅ Niches créées")

  // Créer des tendances de test pour chaque niche
  const niches = await prisma.niche.findMany()

  const testTrends = [
    // Finance personnelle
    {
      nicheId: niches.find(n => n.slug === "finance-personnelle")?.id,
      title: "Investir dans l'or en 2024",
      description: "Guide complet pour investir dans l'or物理",
      score: 85,
      velocity: 45.5,
      status: "GROWING",
      searchVolume: 12500,
      videoCount: 234,
      avgViews: 45000,
      contentAngles: [" comment acheter de l'or", "ORAGE vs actions", "Les meilleures offres"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      nicheId: niches.find(n => n.slug === "finance-personnelle")?.id,
      title: "Cryptomonnaies pour débutants",
      description: "Tout savoir sur le Bitcoin et les cryptos",
      score: 72,
      velocity: 28.3,
      status: "EMERGING",
      searchVolume: 8900,
      videoCount: 567,
      avgViews: 23000,
      contentAngles: ["Acheter Bitcoin facilement", "Wallet cryptoconseils"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    // Tech & IA
    {
      nicheId: niches.find(n => n.slug === "tech-ia")?.id,
      title: "ChatGPT prompts avancés",
      description: "Maîtrisez l'IA pour gagner du temps",
      score: 92,
      velocity: 156.7,
      status: "PEAK",
      searchVolume: 45000,
      videoCount: 890,
      avgViews: 78000,
      contentAngles: ["Meilleurs prompts ChatGPT", "Automatiser votre travail", "IA pour coder"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      nicheId: niches.find(n => n.slug === "tech-ia")?.id,
      title: "No-code tools 2024",
      description: "Créez sans programmer",
      score: 68,
      velocity: 34.2,
      status: "GROWING",
      searchVolume: 6700,
      videoCount: 345,
      avgViews: 18000,
      contentAngles: ["Bubble vs FlutterFlow", "Automatiser sans code"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    // Fitness
    {
      nicheId: niches.find(n => n.slug === "fitness")?.id,
      title: "Programme musculation à la maison",
      description: "Sans équipement, des résultats",
      score: 78,
      velocity: 89.4,
      status: "PEAK",
      searchVolume: 23000,
      videoCount: 456,
      avgViews: 56000,
      contentAngles: ["Programme gratuit 30 jours", "Poids du corps uniquement", "Progrès rapide"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    // Cuisine
    {
      nicheId: niches.find(n => n.slug === "cuisine")?.id,
      title: "Batch cooking hebdomadaire",
      description: "Gagnez du temps en cuisine",
      score: 65,
      velocity: 22.1,
      status: "EMERGING",
      searchVolume: 5400,
      videoCount: 289,
      avgViews: 34000,
      contentAngles: ["5 repas en 2h", "Économie et santé"],
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  ]

  for (const trend of testTrends) {
    if (trend.nicheId) {
      await prisma.trend.upsert({
        where: { title_niche: { title: trend.title, nicheId: trend.nicheId } },
        update: trend,
        create: trend,
      })
    }
  }

  console.log("✅ Tendances de test créées")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

Ajouter dans `package.json` :
```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

Exécuter :
```bash
npx prisma db seed
```

---

## Phase 10 — Variables d'environnement complètes

Fichier : `.env.local` (complet)

```env
# ─── Base de données PostgreSQL ───────────────────────────
DATABASE_URL="postgresql://user:password@localhost:5432/trendhunter"
DIRECT_URL="postgresql://user:password@localhost:5432/trendhunter"

# ─── NextAuth ─────────────────────────────────────────────
AUTH_SECRET="openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
AUTH_GOOGLE_ID="xxxx.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-xxxx"

# ─── Stripe ───────────────────────────────────────────────
STRIPE_SECRET_KEY="sk_test_xxxx"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_xxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxx"
STRIPE_PRO_PRICE_ID="price_xxxx"
STRIPE_TEAM_PRICE_ID="price_xxxx"

# ─── IA ───────────────────────────────────────────────────
ANTHROPIC_API_KEY="sk-ant-xxxx"

# ─── Cache ────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL="https://xxxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="xxxx"

# ─── YouTube ──────────────────────────────────────────────
YOUTUBE_API_KEY="AIzaxxx"

# ─── Email ────────────────────────────────────────────────
RESEND_API_KEY="re_xxxx"
EMAIL_FROM="TrendHunter <alerts@trendhunter.app>"
```

---

## Phase 11 — Checklist de déploiement

### Vercel (Next.js)
- [ ] Connecter le repo GitHub à Vercel
- [ ] Ajouter toutes les variables d'environnement de `.env.local`
- [ ] Changer `NEXTAUTH_URL` pour le domaine de prod
- [ ] Builder et vérifier le deployment

### PostgreSQL
- [ ] S'assurer que la DB est accessible en production
- [ ] Exécuter `npx prisma migrate deploy` en prod
- [ ] Vérifier les connexions depuis Vercel

### Stripe
- [ ] Créer les produits Pro et Team dans le dashboard
- [ ] Copier les Price IDs
- [ ] Configurer le webhook endpoint : `https://trendhunter.app/api/stripe/webhook`
- [ ] Sélectionner les événements : `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] Copier le `STRIPE_WEBHOOK_SECRET` généré

### Google OAuth
- [ ] Créer un projet Google Cloud
- [ ] Activer l'API Google+ et l'API OAuth
- [ ] Créer des credentials OAuth 2.0
- [ ] Ajouter l'URI de redirection de prod : `https://trendhunter.app/api/auth/callback/google`

### Extension Chrome
- [ ] Remplacer `https://trendhunter.app` dans `background.js` par le vrai domaine
- [ ] Créer les icônes PNG 16x16, 48x48, 128x128
- [ ] Zipper le dossier `extension/`
- [ ] Publier sur Chrome Web Store (frais uniques : 5$)

---

## Ordre d'implémentation recommandé

1. **Phase 1** — Setup projet Next.js + dépendances
2. **Phase 2** — Prisma schema + migration
3. **Phase 3** — NextAuth + Google OAuth (tester le login)
4. **Phase 9** — Seed niches
5. **Phase 4** — Stripe webhook (tester en local avec Stripe CLI)
6. **Phase 5** — API /api/trends (tester avec Postman)
7. **Phase 8** — Pages dashboard
8. **Phase 6** — API extension
9. **Phase 7** — Extension Chrome
10. **Phase 11** — Déploiement