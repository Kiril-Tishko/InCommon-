import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` produces a normal static site (dist/) for any static host.
// `npm run build:single` produces one self-contained HTML file (dist-single/index.html).
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "single" ? [react(), viteSingleFile()] : [react()],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    target: "es2022",
  },
  worker: { format: "es" },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
}));
