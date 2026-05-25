export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://trendhunter.app'

export const API_ENDPOINTS = {
  trends: '/api/extension/trends',
  analyze: '/api/extension/analyze',
  niches: '/api/extension/trends/niches',
} as const

export const DEFAULT_NICHES: { slug: string; name: string }[] = [
  { slug: 'tech-ia', name: 'Tech & IA' },
  { slug: 'finance-personnelle', name: 'Finance' },
  { slug: 'fitness', name: 'Fitness' },
  { slug: 'cuisine', name: 'Cuisine' },
  { slug: 'business-en-ligne', name: 'Business en ligne' },
]
