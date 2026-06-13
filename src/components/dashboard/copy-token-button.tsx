"use client"

import { useState } from "react"

export function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button onClick={handleClick} className="px-3 py-2 border rounded text-sm">
      {copied ? "Copié !" : "Copier"}
    </button>
  )
}
