"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function GenerateTokenButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/extension/auth", { method: "POST" });
      const data = await res.json();
      if (data.token) {
        await navigator.clipboard.writeText(data.token);
        alert("Token copié dans le presse-papiers !");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={isLoading} variant="outline">
      {isLoading ? "Génération..." : "Générer un nouveau token"}
    </Button>
  );
}
