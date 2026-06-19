/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        york: {
          red: "#E31837",
          dark: "#1a1a2e",
          muted: "#6b7280",
        },
      },
    },
  },
  plugins: [],
};
