import { defineConfig } from "vitest/config";

// Configurazione separata da vite.config.ts, che ha la radice in app/.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
