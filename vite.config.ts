import { defineConfig } from "vite";

export default defineConfig({
  root: "app",
  base: "./",
  build: { outDir: "../dist-app", emptyOutDir: true, target: "es2022" },
  // Il worker dell'editor carica wasmoon come il client: serve il formato a moduli.
  worker: { format: "es" },
});
