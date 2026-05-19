import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          black: "#000000",
          surface: "#111111",
          elevated: "#1a1a1a",
          border: "#2a2a2a",
          red: "#C8102E",
          "red-hover": "#A50D25",
          muted: "#a3a3a3",
          stripe: "#0d0d0d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
