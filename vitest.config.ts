import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [
      "e2e/**",
      "**/*.e2e.test.ts",
    ],
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "json", "html"],
    include: ["src/**/*.{ts,tsx}"],
    exclude: [
      "**/*.d.ts",
      "**/*.config.ts",
      "**/feature-flags.disabled/**",
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/app/**/loading.tsx",
      "src/app/**/not-found.tsx",
      "src/app/**/error.tsx",
      "src/app/**/global-error.tsx",
      "src/app/**/manifest.ts",
      "src/app/**/sitemap.ts",
      "src/app/**/robots.ts",
      "src/types/**",
      "src/lib/feature-flags.disabled/**",
    ],
    thresholds: {
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
