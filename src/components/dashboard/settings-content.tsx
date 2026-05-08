"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { User, ShieldAlert, Trash2, LogOut } from "lucide-react"
import { signOut } from "next-auth/react"

export function SettingsContent({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<"infos" | "data">("infos")
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDeleteAccount = async () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.")) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch("/api/user", {
        method: "DELETE",
      })

      if (response.ok) {
        signOut({ callbackUrl: "/" })
      } else {
        alert("Une erreur est survenue lors de la suppression du compte.")
      }
    } catch (error) {
      console.error("Error deleting account:", error)
      alert("Une erreur est survenue lors de la suppression du compte.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Tab Menu */}
      <div className="flex gap-1 border-b border-hairline-dark mb-6">
        <button
          onClick={() => setActiveTab("infos")}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === "infos" ? "text-dark-ink" : "text-dark-ink-secondary hover:text-dark-ink"
          }`}
        >
          Informations
          {activeTab === "infos" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yt-red" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("data")}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === "data" ? "text-dark-ink" : "text-dark-ink-secondary hover:text-dark-ink"
          }`}
        >
          Données
          {activeTab === "data" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yt-red" />
          )}
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "infos" && (
        <Card className="rounded-none">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-dark-ink-tertiary" />
              <CardTitle className="text-dark-ink">Profil</CardTitle>
            </div>
            <CardDescription className="text-dark-ink-secondary">Vos informations personnelles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-dark-ink-secondary">Nom</label>
              <Input value={user.name || ""} disabled className="rounded-none bg-dark-overlay border-hairline-dark" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-dark-ink-secondary">Email</label>
              <Input value={user.email || ""} disabled className="rounded-none bg-dark-overlay border-hairline-dark" />
              <p className="text-[10px] text-dark-ink-tertiary italic">L'email est géré par votre compte Google.</p>
            </div>

            <Separator className="my-6 opacity-20" />

            <div className="pt-2">
              <Button 
                variant="outline" 
                className="w-full justify-start text-dark-ink-secondary hover:text-yt-red hover:bg-yt-red/5 border-hairline-dark"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Se déconnecter
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "data" && (
        <Card className="rounded-none border-yt-red/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-yt-red" />
              <CardTitle className="text-dark-ink">Zone de danger</CardTitle>
            </div>
            <CardDescription className="text-dark-ink-secondary">Actions irréversibles sur votre compte</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-4 p-4 bg-yt-red/5 border border-yt-red/10">
              <div>
                <p className="text-sm font-bold text-dark-ink">Supprimer mon compte</p>
                <p className="text-xs text-dark-ink-secondary mt-1">
                  Cette action supprimera définitivement vos données, niches suivies et alertes.
                </p>
              </div>
              <Button 
                variant="destructive" 
                size="sm" 
                className="shrink-0"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isDeleting ? "Suppression..." : "Supprimer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>

  )
}
