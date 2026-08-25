/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ebff",
          200: "#bcdcff",
          300: "#8ec4ff",
          400: "#59a3ff",
          500: "#3280ff",
          600: "#1c5ff5",
          700: "#164ce0",
          800: "#193fb5",
          900: "#1a398f",
        },
      },
    },
  },
  plugins: [],
};
