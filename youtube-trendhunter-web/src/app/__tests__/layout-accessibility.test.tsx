/**
 * TEST 6 — Accessibilité du layout
 *
 * Vérifie que le layout racine utilise lang="fr".
 *
 * Approche : on lit le fichier source et on vérifie la présence
 * de lang="fr" via regex, car le rendu de <html> dans jsdom
 * est problématique (React 19 + jsdom n'accepte pas <html> dans un div).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const layoutPath = resolve(__dirname, "../layout.tsx");
const layoutSource = readFileSync(layoutPath, "utf-8");

describe("RootLayout — Accessibilité (source)", () => {
  it("contient lang='fr' dans le JSX du <html>", () => {
    // Vérifier que le JSX contient lang="fr"
    expect(layoutSource).toContain('lang="fr"');
    // Vérifier que c'est sur la balise <html>
    const htmlLine = layoutSource.split("\n").find((l) => l.includes("<html"));
    expect(htmlLine).toContain('lang="fr"');
  });

  it("contient suppressHydrationWarning sur <html>", () => {
    const htmlLine = layoutSource.split("\n").find((l) => l.includes("<html"));
    expect(htmlLine).toContain("suppressHydrationWarning");
  });

  it("définit la variable Roboto via className", () => {
    const htmlLine = layoutSource.split("\n").find((l) => l.includes("<html"));
    expect(htmlLine).toContain("roboto.variable");
  });

  it("inclut la classe antialiased sur <html>", () => {
    const htmlLine = layoutSource.split("\n").find((l) => l.includes("<html"));
    expect(htmlLine).toContain("antialiased");
  });

  it("inclut un script d'initialisation du thème (beforeInteractive)", () => {
    expect(layoutSource).toContain("Script");
    expect(layoutSource).toContain("beforeInteractive");
    expect(layoutSource).toContain("localStorage.getItem('theme')");
  });

  it("a un body avec les classes CSS min-h-full flex flex-col", () => {
    const bodyLine = layoutSource.split("\n").find((l) => l.includes("<body"));
    expect(bodyLine).toContain("min-h-full");
    expect(bodyLine).toContain("flex");
    expect(bodyLine).toContain("flex-col");
  });

  it("inclut PostHogProvider dans le body", () => {
    expect(layoutSource).toContain("PostHogProvider");
  });

  it("inclut CookieConsent dans le body", () => {
    expect(layoutSource).toContain("CookieConsent");
  });

  it("exporte les metadata avec title et description", () => {
    expect(layoutSource).toContain("metadata:");
    expect(layoutSource).toContain("TrendHunter");
    expect(layoutSource).toContain("Détectez les tendances");
  });

  it("définit la locale OpenGraph à fr_FR", () => {
    expect(layoutSource).toContain("locale:");
    expect(layoutSource).toContain("fr_FR");
  });
});
