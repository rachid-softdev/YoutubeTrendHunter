"use client";

interface PagePreviewProps {
  title: string;
  url: string;
}

export function PagePreview({ title, url }: PagePreviewProps) {
  return (
    <div className="border border-hairline-dark rounded-xl overflow-hidden bg-dark-surface shadow-sm">
      <div className="px-4 py-3 bg-dark-canvas border-b border-hairline-dark flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-dark-ink">{title}</h3>
          <p className="text-xs text-dark-ink-tertiary font-mono mt-0.5">{url}</p>
        </div>
        <span className="text-[10px] font-medium text-dark-ink-tertiary uppercase tracking-wider">
          iframe
        </span>
      </div>
      <div className="bg-dark-canvas">
        <iframe
          src={url}
          title={title}
          className="w-full border-0 bg-dark-canvas"
          style={{ minHeight: 420, height: "auto" }}
          loading="lazy"
          onLoad={(e) => {
            const iframe = e.currentTarget;
            try {
              const doc = iframe.contentDocument || iframe.contentWindow?.document;
              if (doc) {
                const height = doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 420;
                iframe.style.height = `${height}px`;
              }
            } catch {
              // Cross-origin
            }
          }}
        />
      </div>
    </div>
  );
}
