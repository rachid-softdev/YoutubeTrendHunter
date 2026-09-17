import { Inbox } from "lucide-react";

// ============================================
// EmptyState — reusable empty state for admin tables
// ============================================

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="p-8 text-center">
      <Inbox className="w-8 h-8 text-dark-ink-tertiary mx-auto mb-3" />
      <p className="text-dark-ink-secondary text-sm font-medium">{title}</p>
      {description && <p className="text-dark-ink-tertiary text-xs mt-1">{description}</p>}
    </div>
  );
}
