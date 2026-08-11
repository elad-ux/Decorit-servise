import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base + HashRouter (see src/main.tsx) so the build works unchanged
// whether it's served from a GitHub Pages project subpath or a custom domain.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
