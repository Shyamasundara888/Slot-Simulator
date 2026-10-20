import { defineConfig } from "vite";

export default defineConfig({
  root: "app",
  base: "./",
  build: { outDir: "../dist-app", emptyOutDir: true, target: "es2022" },
});
