/**
 * TEST 6b — Accessibilité du ThemeToggle
 *
 * Vérifie que le composant ThemeToggle est accessible :
 * - Présence de l'attribut aria-label
 * - aria-label change selon le thème
 * - Le bouton est un <button> accessible
 *
 * Note : On mocke useSyncExternalStore de React pour éviter les problèmes
 * de résolution en environnement jsdom (React 19).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock window.matchMedia pour jsdom (pas supporté nativement)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock useSyncExternalStore pour éviter les problèmes en jsdom/React 19.
// On appelle getSnapshot (client) plutôt que getServerSnapshot pour que
// les modifications de localStorage (comme setItem('theme', 'light'))
// soient répercutées dans le rendu.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useSyncExternalStore: vi.fn((_subscribe: any, getSnapshot: () => any) => {
      return getSnapshot();
    }),
  };
});

// Mock lucide-react
vi.mock("lucide-react", () => ({
  Sun: () => <span data-testid="sun-icon">Sun</span>,
  Moon: () => <span data-testid="moon-icon">Moon</span>,
}));

// Mock du composant Button
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant,
    size,
    className,
    onClick,
    "aria-label": ariaLabel,
    ...props
  }: any) => (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  ),
}));

// ─── Imports ────────────────────────────────────────────────────────────────

import { render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/theme-toggle";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ThemeToggle — Accessibilité", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("a un attribut aria-label présent", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    const ariaLabel = button.getAttribute("aria-label");
    expect(ariaLabel).not.toBeNull();
  });

  it("a un aria-label non vide", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    const label = button.getAttribute("aria-label");
    expect(label).not.toBeNull();
    expect(label!.length).toBeGreaterThan(0);
  });

  it("est un élément <button> natif (rôle 'button')", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.tagName).toBe("BUTTON");
  });

  it("a aria-label = 'Passer en mode clair' quand le thème est dark", () => {
    localStorage.setItem("theme", "dark");
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("Passer en mode clair");
  });

  it("a aria-label = 'Passer en mode sombre' quand le thème est light", () => {
    localStorage.setItem("theme", "light");
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("Passer en mode sombre");
  });

  it("a une className avec des classes de style (tailwind)", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.className).toContain("rounded-full");
    expect(button.className).toContain("hover:");
  });

  it("est accessible au clavier (tabIndex >= 0)", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("a une taille icon (data-size='icon')", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.getAttribute("data-size")).toBe("icon");
  });

  it("a un variant ghost", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button.getAttribute("data-variant")).toBe("ghost");
  });
});
