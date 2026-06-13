"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function GenerateTokenButton() {
  const [isLoading, setIsLoading] = useState(false)

  const [message, setMessage] = useState<string | null>(null)

  const handleClick = async () => {
    setIsLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/extension/auth", { method: "POST" })
      const data = await res.json()
      if (data.token) {
        await navigator.clipboard.writeText(data.token)
        setMessage("Token copié dans le presse-papiers !")
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      console.error(error)
      setMessage("Erreur lors de la génération")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <Button onClick={handleClick} disabled={isLoading} variant="outline">
        {isLoading ? "Génération..." : "Générer un nouveau token"}
      </Button>
      {message && <p className="text-sm text-green-600 mt-2">{message}</p>}
    </div>
  )
}