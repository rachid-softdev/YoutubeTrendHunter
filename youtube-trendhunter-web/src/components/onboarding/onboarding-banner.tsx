"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OnboardingBannerProps {
  className?: string;
}

const steps = [
  { id: 1, label: "Choisir une niche" },
  { id: 2, label: "Explorer les tendances" },
  { id: 3, label: "Configurer les alertes" },
];

export function OnboardingBanner({ className }: OnboardingBannerProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [completedSteps, setCompletedSteps] = useState(0);

  useEffect(() => {
    // Check if dismissed
    const dismissed = localStorage.getItem("onboarding-banner-dismissed");
    if (dismissed) {
      setIsDismissed(true);
      return;
    }

    // Check completed steps
    const stored = localStorage.getItem("onboarding-completed-steps");
    if (stored) {
      const parsed = JSON.parse(stored);
      // Map completed steps to progress
      if (parsed.includes("select-niche")) setCompletedSteps(1);
      if (parsed.includes("view-trends")) setCompletedSteps(2);
      if (parsed.includes("create-alert")) setCompletedSteps(3);
    }

    // Animate entrance
    const timer = setTimeout(() => setIsVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("onboarding-banner-dismissed", "true");
    setIsVisible(false);
  };

  const handleStart = () => {
    router.push("/onboarding");
  };

  // Don't show if dismissed or more than 1 step completed
  if (isDismissed || completedSteps > 1) {
    return null;
  }

  return (
    <div
      className={`relative bg-gradient-to-r from-yt-red/10 to-yt-link/10 border-b border-hairline-dark transition-all duration-500 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
      } ${className || ""}`}
    >
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Message */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yt-red/20 flex items-center justify-center">
              <Play className="w-5 h-5 text-yt-red fill-current" />
            </div>
            <div>
              <p className="text-dark-ink font-medium">
                Bienvenue ! Configurez votre espace en 2 minutes.
              </p>
              {/* Steps Indicator */}
              <div className="flex items-center gap-2 mt-2">
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full transition-all ${
                        index < completedSteps
                          ? "bg-yt-red"
                          : index === completedSteps
                            ? "bg-yt-link animate-pulse-glow"
                            : "bg-dark-overlay"
                      }`}
                    />
                    <span
                      className={`text-xs ${
                        index <= completedSteps
                          ? "text-dark-ink-secondary"
                          : "text-dark-ink-tertiary"
                      }`}
                    >
                      {step.label}
                    </span>
                    {index < steps.length - 1 && <div className="w-4 h-px bg-dark-overlay" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleStart}
              className="bg-yt-red hover:bg-yt-red-deep text-white font-bold"
            >
              Commencer
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <button
              onClick={handleDismiss}
              className="text-sm text-dark-ink-tertiary hover:text-dark-ink-secondary transition-colors"
            >
              Plus tard
            </button>
          </div>
        </div>
      </div>

      {/* Close X at the end */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-dark-ink-tertiary hover:text-dark-ink-secondary transition-colors p-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
