import { defineConfig } from "vite";

export default defineConfig({
  base: "/I-find-ai/engine/",

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",

    rollupOptions: {
      input: {
        main: "index.html",
        worker: "src/worker.js"
      }
    }
  },

  server: {
    host: "0.0.0.0"
  }
});
