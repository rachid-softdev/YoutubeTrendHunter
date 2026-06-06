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