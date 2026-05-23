"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ManageSubscriptionButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={isLoading} variant="outline">
      {isLoading ? "Chargement..." : "Gérer l'abonnement"}
    </Button>
  );
}
