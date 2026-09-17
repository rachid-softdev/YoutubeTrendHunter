"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================
// ConfirmDialog — destructive action confirmation
// ============================================

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative bg-dark-surface border border-hairline-dark rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-dark-ink-tertiary hover:text-dark-ink-secondary transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-dark-ink mb-2">{title}</h3>
        <p className="text-sm text-dark-ink-secondary mb-6">{message}</p>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className={danger ? "bg-red-600 text-white hover:bg-red-700" : ""}
          >
            {loading ? "…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
