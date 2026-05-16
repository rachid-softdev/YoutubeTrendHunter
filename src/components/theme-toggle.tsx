"use client"

import { useSyncExternalStore } from "react"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"

// External store for theme - avoids double render issues
const themeStore = {
  getServerValue() {
    return "dark" // Server-side default
  },

  getClientValue() {
    if (typeof window === "undefined") return "dark"
    const saved = localStorage.getItem("theme") as "light" | "dark" | null
    if (saved) return saved
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
  },

  subscribe(callback: () => void) {
    // Subscribe to storage changes and media query changes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "theme") callback()
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)")
    const handleChange = () => callback()

    window.addEventListener("storage", handleStorage)
    mediaQuery.addEventListener("change", handleChange)

    return () => {
      window.removeEventListener("storage", handleStorage)
      mediaQuery.removeEventListener("change", handleChange)
    }
  },
}

function useTheme() {
  return useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getClientValue,
    themeStore.getServerValue
  )
}

export function ThemeToggle() {
  const theme = useTheme()

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark"
    localStorage.setItem("theme", next)
    document.documentElement.classList.toggle("dark", next === "dark")
    // Force re-render by triggering subscribe
    document.dispatchEvent(new Event("storage"))
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="w-9 h-9 rounded-full hover:bg-dark-overlay"
      aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4 text-dark-ink-secondary" />
      ) : (
        <Moon className="w-4 h-4 text-ink-secondary" />
      )}
    </Button>
  )
}
