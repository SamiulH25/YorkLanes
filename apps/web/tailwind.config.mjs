/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        york: {
          red: "#E31837",
          "red-dark": "#B8122C",
          "red-soft": "#FEE8EC",
          black: "#111111",
          navy: "#0C1220",
          slate: "#161D2E",
          cream: "#FAF7F2",
          stone: "#E8E4DC",
          muted: "#6B7280",
          gold: "#C9A227",
        },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Source Sans 3", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(17, 17, 17, 0.06), 0 8px 24px rgba(17, 17, 17, 0.04)",
        "card-dark": "0 1px 3px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.2)",
        glow: "0 0 40px rgba(227, 24, 55, 0.12)",
      },
      backgroundImage: {
        "york-stripes":
          "repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(227,24,55,0.03) 8px, rgba(227,24,55,0.03) 16px)",
        "york-hero":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(227,24,55,0.14), transparent)",
      },
    },
  },
  plugins: [],
};
