"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Check, Loader2 } from "lucide-react";

interface NicheFollowButtonProps {
  nicheId: string;
  isFollowing: boolean;
  plan: string;
  currentCount: number;
  maxCount: number;
  onFollowChange: (nicheId: string, isFollowing: boolean) => void;
}

export function NicheFollowButton({
  nicheId,
  isFollowing,
  plan,
  currentCount,
  maxCount,
  onFollowChange,
}: NicheFollowButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const isFreeUserAtLimit = plan === "FREE" && currentCount >= maxCount && !isFollowing;

  const handleClick = async () => {
    if (isFreeUserAtLimit) return;

    setIsLoading(true);
    try {
      const method = isFollowing ? "DELETE" : "POST";
      const url = isFollowing ? `/api/niches/${nicheId}` : "/api/niches";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: isFollowing ? undefined : JSON.stringify({ nicheId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de l'opération");
      }

      onFollowChange(nicheId, !isFollowing);
    } catch (error) {
      console.error("Error:", error);
      alert(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonContent = () => {
    if (isLoading) {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    if (isFollowing) {
      return (
        <>
          <Check className="w-4 h-4 mr-1" />
          Suivi
        </>
      );
    }
    return (
      <>
        <Plus className="w-4 h-4 mr-1" />
        Suivre
      </>
    );
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isFollowing ? "secondary" : "outline"}
        size="sm"
        onClick={handleClick}
        disabled={isLoading || isFreeUserAtLimit}
        className={isFreeUserAtLimit ? "cursor-not-allowed opacity-50" : ""}
      >
        {getButtonContent()}
      </Button>
      {plan === "FREE" && (
        <span className="text-xs text-dark-ink-tertiary">
          {currentCount}/{maxCount}
        </span>
      )}
    </div>
  );
}
