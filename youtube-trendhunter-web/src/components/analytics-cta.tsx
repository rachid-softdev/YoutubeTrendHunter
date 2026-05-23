"use client";

import { useCallback } from "react";
import Link from "next/link";
import { analytics } from "@/lib/analytics";

interface AnalyticsButtonProps {
  ctaName: string;
  destination: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function AnalyticsButton({
  ctaName,
  destination,
  children,
  className,
  onClick,
}: AnalyticsButtonProps) {
  const handleClick = useCallback(() => {
    analytics.ctaClicked(ctaName, destination);
    onClick?.();
  }, [ctaName, destination, onClick]);

  return (
    <div onClick={handleClick} className={className} style={{ cursor: "pointer" }}>
      {children}
    </div>
  );
}

interface AnalyticsLinkProps {
  ctaName: string;
  destination: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function AnalyticsLink({
  ctaName,
  destination,
  href,
  children,
  className,
}: AnalyticsLinkProps) {
  const handleClick = useCallback(() => {
    analytics.ctaClicked(ctaName, destination);
  }, [ctaName, destination]);

  return (
    <Link href={href} onClick={handleClick} className={className}>
      {children}
    </Link>
  );
}
