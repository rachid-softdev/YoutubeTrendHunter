import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    exclude: ["e2e/**", "node_modules/**", ".opencode/**", ".claude/**"],
    setupFiles: ["./src/lib/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    noExternal: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@youtube-trendhunter/ui": path.resolve(__dirname, "../packages/youtube-trendhunter-ui/src"),
    },
  },
});
