# YouTube TrendHunter

Track and analyze YouTube trending videos with real-time data extraction and analytics.

## Features

- Real-time YouTube trending video tracking
- Niche-based trend filtering
- AI-powered trend scoring with Anthropic
- Browser extension for quick access
- Subscription management with Stripe
- Email notifications for trending alerts

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: Next.js API Routes, NextAuth.js
- **Database**: Prisma with PostgreSQL
- **Payments**: Stripe
- **AI**: Anthropic Claude
- **Caching**: Upstash Redis

## Project Structure

This is a **monorepo** using [pnpm workspaces](https://pnpm.io/workspaces) and [Turbo](https://turbo.build/).

```
├── packages/
│   └── youtube-trendhunter-ui/    # Shared UI component library
├── youtube-trendhunter-web/        # Main Next.js web application
├── youtube-trendhunter-desktop/    # Desktop application (placeholder)
├── youtube-trendhunter-mobile/     # Mobile application (placeholder)
└── youtube-trendhunter-extension/ # Browser extension
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start all apps in development
pnpm dev

# Or start a specific app
pnpm dev:web
```

## Packages

### Root Scripts (run from `youtube-trendhunter-web/`)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in parallel |
| `pnpm dev:web` | Start only the web app |
| `pnpm build` | Build all apps |
| `pnpm build:web` | Build only the web app |
| `pnpm start` | Start production web app |
| `pnpm lint` | Lint all apps |
| `pnpm typecheck` | Type-check all apps |
| `pnpm test` | Run tests for all apps |
| `pnpm test:e2e` | Run end-to-end tests (web) |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Prisma Studio |

### Stripe Development

```bash
pnpm setup:stripe      # Setup Stripe integration
pnpm stripe:setup     # Start Stripe CLI
pnpm stripe:stop      # Stop Stripe CLI
pnpm stripe:test      # Test webhooks
```

### Services

```bash
pnpm dev:services        # Start dev services (Mailhog)
pnpm dev:services:stop   # Stop dev services
```

### App-Specific Commands

You can also run commands directly in each package:

```bash
# Web app
cd youtube-trendhunter-web && pnpm dev

# Desktop
cd youtube-trendhunter-desktop && pnpm dev

# Mobile
cd youtube-trendhunter-mobile && pnpm dev

# Extension
cd youtube-trendhunter-extension && pnpm dev

# UI Library
cd packages/youtube-trendhunter-ui && pnpm dev
```

## License

MIT License - see [LICENSE](LICENSE) for details.