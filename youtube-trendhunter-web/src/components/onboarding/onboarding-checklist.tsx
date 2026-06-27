"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ChevronRight, Target, Eye, Bell, Users } from "lucide-react";

interface OnboardingChecklistProps {
  className?: string;
}

interface Step {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

const steps: Step[] = [
  {
    id: "select-niche",
    title: "Sélectionnez une niche",
    description: "Choisissez le domaine qui vous interesse (Tech, Gaming, Finance...)",
    href: "/niches",
    icon: <Target className="w-5 h-5" />,
  },
  {
    id: "view-trends",
    title: "Explorez les tendances",
    description: "Decouvrez les tendances emergentes dans votre niche",
    href: "/dashboard",
    icon: <Eye className="w-5 h-5" />,
  },
  {
    id: "create-alert",
    title: "Créez une alerte",
    description: "Recevez des notifications quand une nouvelle tendance muncul",
    href: "/alerts",
    icon: <Bell className="w-5 h-5" />,
  },
  {
    id: "invite-team",
    title: "Invitez votre équipe",
    description: "Collaborez avec votre équipe sur TrendHunter",
    href: "/settings",
    icon: <Users className="w-5 h-5" />,
  },
];

export function OnboardingChecklist({ className }: OnboardingChecklistProps) {
  const router = useRouter();
  const [completedSteps, setCompletedSteps] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("onboarding-completed-steps");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          /* ignore */
        }
      }
    }
    return [];
  });
  const [isVisible, setIsVisible] = useState(false);
  const [isSkipped, setIsSkipped] = useState(() => {
    if (typeof window !== "undefined") {
      return !!localStorage.getItem("onboarding-skipped");
    }
    return false;
  });

  useEffect(() => {
    if (isSkipped) return;

    // Animate entrance
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, [isSkipped]);

  const handleCompleteStep = (stepId: string) => {
    const newCompleted = [...completedSteps, stepId];
    setCompletedSteps(newCompleted);
    localStorage.setItem("onboarding-completed-steps", JSON.stringify(newCompleted));
  };

  const handleSkip = () => {
    setIsSkipped(true);
    localStorage.setItem("onboarding-skipped", "true");
    setIsVisible(false);
  };

  // Don't show if more than 1 step completed or skipped
  if (completedSteps.length >= 1 || isSkipped) {
    return null;
  }

  const progress = (completedSteps.length / steps.length) * 100;

  return (
    <div
      className={`bg-dark-surface border border-hairline-dark rounded-lg p-6 transition-all duration-500 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
      } ${className || ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-dark-ink">Guide de configuration</h2>
          <p className="text-sm text-dark-ink-secondary mt-1">
            {completedSteps.length} / {steps.length} étapes complétées
          </p>
        </div>
        <button
          onClick={handleSkip}
          className="text-sm text-dark-ink-tertiary hover:text-dark-ink-secondary transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-dark-overlay rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-yt-red transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step) => {
          const isCompleted = completedSteps.includes(step.id);
          return (
            <div
              key={step.id}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-all duration-300 ${
                isCompleted
                  ? "bg-yt-red/5 border-yt-red/20"
                  : "bg-dark-overlay border-hairline-dark hover:border-dark-ink-tertiary"
              }`}
            >
              {/* Checkbox / Icon */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  isCompleted ? "bg-yt-red text-white" : "bg-dark-surface text-dark-ink-secondary"
                }`}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : step.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3
                  className={`font-medium ${
                    isCompleted ? "text-dark-ink line-through" : "text-dark-ink"
                  }`}
                >
                  {step.title}
                </h3>
                <p className="text-sm text-dark-ink-secondary truncate">{step.description}</p>
              </div>

              {/* CTA */}
              {!isCompleted && (
                <button
                  onClick={() => {
                    handleCompleteStep(step.id);
                    router.push(step.href);
                  }}
                  className="flex items-center gap-1 text-sm font-medium text-yt-link hover:text-yt-link/80 transition-colors"
                >
                  <span>Aller</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion Message */}
      {completedSteps.length > 0 && completedSteps.length < steps.length && (
        <div className="mt-6 text-center">
          <p className="text-sm text-dark-ink-secondary">
            Continuez à explorer TrendHunter pour compléter votre configuration!
          </p>
        </div>
      )}
    </div>
  );
}
