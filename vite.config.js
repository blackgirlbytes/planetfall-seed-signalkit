import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Honor an assigned port when one is set (e.g. by the preview harness)
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    watch: {
      ignored: [
        "**/.vercel/**",
        "**/dist/**",
      ],
    },
  },
});
