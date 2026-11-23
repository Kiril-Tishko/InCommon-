import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import type { ProxyOptions } from "vite";

declare const process: { env: Record<string, string | undefined> };

// When InCommon runs on your PC (`npm run local`, start.bat), its server passes
// /local-ai/* to an AI program on the same PC, so the browser never needs
// cross-origin permission to talk to it. Override the targets with
// INCOMMON_OLLAMA_URL / INCOMMON_LMSTUDIO_URL if they run elsewhere.
function localAi(prefix: string, target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    rewrite: (path) => path.slice(prefix.length) || "/",
    // Present the request as coming from the AI program's own address, which it always accepts.
    headers: { origin: target },
  };
}

const proxy = {
  "/local-ai/ollama": localAi("/local-ai/ollama", process.env.INCOMMON_OLLAMA_URL ?? "http://127.0.0.1:11434"),
  "/local-ai/lmstudio": localAi("/local-ai/lmstudio", process.env.INCOMMON_LMSTUDIO_URL ?? "http://127.0.0.1:1234"),
};

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
  server: { proxy },
  preview: { proxy, host: "127.0.0.1" },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
}));
