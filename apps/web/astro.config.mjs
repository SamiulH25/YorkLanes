import { defineConfig, envField } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  integrations: [tailwind()],
  server: { port: 4321 },
  env: {
    schema: {
      PUBLIC_API_URL: envField.string({
        context: "client",
        access: "public",
        default: "http://localhost:3001",
      }),
    },
  },
});
