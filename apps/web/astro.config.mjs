import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [tailwind()],
  server: {
    port: 4321,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      "/health": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
  vite: {
    server: {
      proxy: {
        "/api": { target: "http://localhost:3001", changeOrigin: true },
        "/health": { target: "http://localhost:3001", changeOrigin: true },
      },
    },
  },
  env: {
    schema: {
      PUBLIC_API_URL: envField.string({
        context: "client",
        access: "public",
        default: "http://localhost:4321",
      }),
    },
  },
});
