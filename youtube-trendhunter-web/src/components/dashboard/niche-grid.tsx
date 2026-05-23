"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Check, Loader2, Target, Zap } from "lucide-react";

interface NicheGridProps {
  allNiches: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    keywords: string[] | null;
    userNiches: Array<{ id: string }>;
    _count: { trends: number };
  }>;
  userNiches: Array<{
    niche: { id: string; name: string; slug: string };
  }>;
  plan: string;
  currentCount: number;
  maxCount: number;
}

export function NicheGrid({ allNiches, userNiches, plan, currentCount, maxCount }: NicheGridProps) {
  const [following, setFollowing] = useState<Set<string>>(
    new Set(userNiches.map((un) => un.niche.id)),
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const isFreeUserAtLimit = plan === "FREE" && currentCount >= maxCount;

  const handleFollow = async (nicheId: string, willFollow: boolean) => {
    setLoadingId(nicheId);
    try {
      if (willFollow) {
        // Follow niche
        const response = await fetch("/api/niches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nicheId }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Erreur lors du suivi");
        }

        setFollowing((prev) => new Set([...prev, nicheId]));
      } else {
        // Unfollow niche
        const response = await fetch(`/api/niches/${nicheId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Erreur lors de l'arrêt du suivi");
        }

        setFollowing((prev) => {
          const next = new Set(prev);
          next.delete(nicheId);
          return next;
        });
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Niches</h1>
        <p className="text-dark-ink-secondary mt-1">
          Suivez les niches qui vous intéressent pour recevoir leurs tendances
        </p>
      </div>

      {/* Plan info */}
      {plan === "FREE" && (
        <div className="mb-6 p-4 bg-dark-surface border border-hairline-dark rounded-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-dark-ink-secondary">
                Plan gratuit:{" "}
                <span className="font-medium text-dark-ink">
                  {currentCount}/{maxCount} niches
                </span>
              </span>
            </div>
            {isFreeUserAtLimit && (
              <Button size="sm" className="rounded-none">
                Passer à Pro
              </Button>
            )}
          </div>
        </div>
      )}

      {/* User's followed niches */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-dark-ink-secondary mb-4">
          Vos niches ({userNiches.length})
        </h2>
        <div className="space-y-3">
          {userNiches.map(({ niche }) => (
            <Card key={niche.id} className="rounded-none">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium text-dark-ink">{niche.name}</h3>
                  <p className="text-sm text-dark-ink-secondary">/{niche.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="members">SUIVI</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFollow(niche.id, false)}
                    disabled={loadingId === niche.id}
                    className="text-red-500"
                  >
                    {loadingId === niche.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Quitter"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {userNiches.length === 0 && (
            <Card className="rounded-none">
              <CardContent className="py-8 text-center text-dark-ink-secondary">
                <Target className="w-8 h-8 mx-auto mb-2 text-dark-ink-tertiary" />
                <p>Vous ne suivez aucune niche pour le moment</p>
                <p className="text-sm mt-1">Ajoutez une niche ci-dessous pour commencer</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Available niches */}
      <div>
        <h2 className="text-sm font-medium text-dark-ink-secondary mb-4">
          Niches disponibles ({allNiches.length})
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {allNiches.map((niche) => {
            const isFollowing = following.has(niche.id);
            const canFollow = !isFreeUserAtLimit || isFollowing;

            return (
              <Card
                key={niche.id}
                className={`rounded-none ${isFollowing ? "border-yt-red/30" : ""}`}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-dark-ink">{niche.name}</h3>
                    <p className="text-sm text-dark-ink-secondary">
                      {niche._count.trends} tendances
                    </p>
                  </div>
                  {isFollowing ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="members">SUIVI</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFollow(niche.id, false)}
                        disabled={loadingId === niche.id}
                        className="text-red-500"
                      >
                        {loadingId === niche.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Quitter"
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFollow(niche.id, true)}
                      disabled={!canFollow || loadingId === niche.id}
                      className={!canFollow ? "cursor-not-allowed opacity-50" : ""}
                    >
                      {loadingId === niche.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-1" />
                          Suivre
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
