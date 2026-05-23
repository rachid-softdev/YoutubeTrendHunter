"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="shrink-0 rounded-none border-hairline-dark hover:bg-dark-overlay"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 mr-1 text-green-500" />
          Copié
        </>
      ) : (
        <>
          <Copy className="w-4 h-4 mr-1" />
          Copier
        </>
      )}
    </Button>
  );
}
