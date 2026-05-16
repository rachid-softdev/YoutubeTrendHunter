"use client"

import { Component, ReactNode, ErrorInfo } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error caught by boundary:", error, info.componentStack)

    if (typeof window !== "undefined" && window.Sentry) {
      window.Sentry.captureException(error, {
        extra: {
          componentStack: info.componentStack,
        },
      })
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center space-y-6 max-w-md">
            <div className="bg-yt-red/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-yt-red" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Une erreur est survenue</h2>
              <p className="text-dark-ink-secondary">
                Quelque chose s&apos;est mal passé. Veuillez rafraîchir la page ou revenir plus tard.
              </p>
              {process.env.NODE_ENV === "development" && this.state.error && (
                <pre className="mt-4 p-4 bg-red-50 text-red-800 text-xs rounded text-left overflow-auto max-h-40">
                  {this.state.error.message}
                </pre>
              )}
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button onClick={this.handleReset} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Réessayer
              </Button>
              <Button variant="outline" onClick={() => window.location.href = "/"} className="gap-2">
                <Home className="w-4 h-4" />
                Accueil
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

declare global {
  interface Window {
    Sentry?: {
      captureException: (error: Error, options?: Record<string, unknown>) => void
      captureMessage: (message: string, options?: Record<string, unknown>) => void
    }
  }
}