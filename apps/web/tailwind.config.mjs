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
          black: "#0F0F12",
          navy: "#030508",
          slate: "#0a0f18",
          panel: "#0f141d",
          graphite: "#161d28",
          cream: "#F8F6F1",
          stone: "#E5E1D8",
          muted: "#64748B",
          gold: "#C9A227",
        },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 15, 18, 0.04), 0 8px 32px rgba(15, 15, 18, 0.06)",
        "card-dark": "0 1px 2px rgba(0, 0, 0, 0.2), 0 12px 40px rgba(0, 0, 0, 0.35)",
        glow: "0 0 48px rgba(227, 24, 55, 0.15)",
        "inner-soft": "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
      },
      backgroundImage: {
        "york-mesh":
          "radial-gradient(ellipse 120% 80% at 0% -20%, rgba(227,24,55,0.08), transparent 50%), radial-gradient(ellipse 80% 60% at 100% 0%, rgba(201,162,39,0.06), transparent 45%)",
        "york-mesh-dark":
          "radial-gradient(ellipse 100% 70% at 0% -10%, rgba(227,24,55,0.12), transparent 50%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(227,24,55,0.06), transparent 40%)",
        "york-hero":
          "radial-gradient(ellipse 90% 70% at 50% -20%, rgba(227,24,55,0.12), transparent 55%)",
        "york-hero-dark":
          "radial-gradient(ellipse 80% 60% at 50% -30%, rgba(227,24,55,0.05), transparent 60%)",
        "sidebar-accent": "linear-gradient(180deg, rgba(227,24,55,0.9) 0%, rgba(184,18,44,0.4) 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.45s ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
