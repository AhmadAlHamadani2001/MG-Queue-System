import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mg: {
          red: "#E20613",
          redDeep: "#9E0016",
          ink: "#0B0C10",
          cream: "#F7F5F0",
        },
      },
      fontFamily: {
        en: ["Inter", "sans-serif"],
        ar: ["Cairo", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
