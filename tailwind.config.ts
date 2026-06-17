import type { Config } from "tailwindcss";

export default {
  content: ["./src/frontend/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        muted: "#667085",
        line: "#d7dde5",
        surface: "#ffffff",
        app: "#f4f6f8",
        brand: "#0f766e"
      }
    }
  },
  plugins: []
} satisfies Config;
