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
- **Database**: Prisma with MySQL
- **Payments**: Stripe
- **AI**: Anthropic Claude
- **Caching**: Upstash Redis

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
npm run dev:setup

# Start development
npm run dev
```

## Project Structure

```
├── src/
│   ├── app/          # Next.js App Router pages
│   ├── components/   # React components
│   ├── lib/          # Utility functions
│   └── types/        # TypeScript types
├── prisma/           # Database schema
├── scripts/          # Development scripts
└── extension/        # Browser extension
```

## License

MIT License - see [LICENSE](LICENSE) for details.