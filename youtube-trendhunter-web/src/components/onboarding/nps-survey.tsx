"use client"

import { useState, useEffect } from "react"
import { X, Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface NpsSurveyProps {
  className?: string
}

// Track NPS locally
const trackNPS = async (score: number, comment?: string) => {
  // In a real app, this would call an analytics API
  // For now, store locally
  if (typeof window !== "undefined") {
    console.log("NPS Score:", score, "Comment:", comment)
    // Store submission
    localStorage.setItem(
      "nps-submission",
      JSON.stringify({
        score,
        comment,
        date: new Date().toISOString(),
      })
    )
  }
}

export function NpsSurvey({ className }: NpsSurveyProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [selectedScore, setSelectedScore] = useState<number | null>(null)
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  useEffect(() => {
    // Check if already submitted
    const submitted = localStorage.getItem("nps-submission")
    if (submitted) {
      setIsDismissed(true)
      return
    }

    // Check signup date (14 days after signup)
    const signupDate = localStorage.getItem("signup-date")
    if (!signupDate) {
      // First visit - store signup date
      localStorage.setItem("signup-date", new Date().toISOString())
      setIsDismissed(true)
      return
    }

    const signup = new Date(signupDate)
    const now = new Date()
    const daysSinceSignup = Math.floor(
      (now.getTime() - signup.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Show after 14 days
    if (daysSinceSignup >= 14) {
      const timer = setTimeout(() => setIsVisible(true), 3000)
      return () => clearTimeout(timer)
    } else {
      setIsDismissed(true)
    }
  }, [])

  const handleDismiss = () => {
    setIsVisible(false)
    setIsDismissed(true)
    // Remember dismissed for this session
    localStorage.setItem("nps-dismissed", "true")
  }

  const handleSubmit = async () => {
    if (selectedScore === null) return

    setIsSubmitting(true)

    try {
      await trackNPS(selectedScore, comment || undefined)
      setIsSubmitted(true)

      // Auto close after success
      setTimeout(() => {
        setIsVisible(false)
        setIsDismissed(true)
      }, 2000)
    } catch (err) {
      console.error("NPS submission failed:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Don't show if dismissed or submitted
  if (isDismissed && !isVisible) {
    return null
  }

  const getScoreLabel = (score: number) => {
    if (score <= 6) return "Detracteur"
    if (score <= 8) return "Passif"
    return "Promoteur"
  }

  const getScoreColor = (score: number) => {
    if (score <= 6) return "text-yt-red"
    if (score <= 8) return "text-amber-500"
    return "text-green-500"
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      } ${className || ""}`}
    >
      <div className="relative bg-dark-surface border border-hairline-dark rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-dark-ink-tertiary hover:text-dark-ink-secondary transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {isSubmitted ? (
          // Success State
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Send className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-xl font-bold text-dark-ink mb-2">
              Merci pour votre retour !
            </h3>
            <p className="text-dark-ink-secondary">
              Votre avis nous aide à améliorer TrendHunter.
            </p>
          </div>
        ) : (
          // Survey Form
          <div>
            <h3 className="text-xl font-bold text-dark-ink mb-2">
              Comment s&apos;est passée votre première semaine ?
            </h3>
            <p className="text-dark-ink-secondary text-sm mb-6">
              Votre avis nous aide à améliorer TrendHunter.
            </p>

            {/* Score Buttons */}
            <div className="flex items-center justify-between gap-1 mb-6">
              {Array.from({ length: 11 }, (_, i) => i).map((score) => (
                <button
                  key={score}
                  onClick={() => setSelectedScore(score)}
                  className={`w-8 h-8 rounded text-sm font-medium transition-all ${
                    selectedScore === score
                      ? "bg-yt-red text-white"
                      : "bg-dark-overlay text-dark-ink-secondary hover:bg-dark-ink-tertiary hover:text-dark-ink"
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>

            {/* Selected Score Label */}
            {selectedScore !== null && (
              <div className={`text-center mb-4 ${getScoreColor(selectedScore)}`}>
                <span className="text-sm font-medium">
                  {getScoreLabel(selectedScore)} ({selectedScore}/10)
                </span>
              </div>
            )}

            {/* Optional Comment */}
            <Textarea
              placeholder="Commentaire optionnel..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mb-4 resize-none"
              rows={3}
            />

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={selectedScore === null || isSubmitting}
              className="w-full bg-yt-red hover:bg-yt-red-deep text-white font-bold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  Envoyer mon avis
                  <Send className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>

            {/* Dismiss Link */}
            <button
              onClick={handleDismiss}
              className="block w-full text-center text-sm text-dark-ink-tertiary hover:text-dark-ink-secondary mt-3 transition-colors"
            >
              Plus tard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}