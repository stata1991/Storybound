import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FFF8F0",
        "cream-warm": "#FEF3E2",
        navy: "#1B2A4A",
        gold: "#C8973E",
        "gold-light": "#D4A94E",
        forest: "#2D5016",
      },
      fontFamily: {
        serif: ["Playfair Display", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "warm": "0 4px 24px rgba(200, 151, 62, 0.15)",
        "warm-lg": "0 8px 40px rgba(200, 151, 62, 0.15)",
      },
    },
  },
  plugins: [],
};
export default config;
