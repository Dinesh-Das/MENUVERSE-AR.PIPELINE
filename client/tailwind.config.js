/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 24px 80px rgba(223, 170, 62, 0.18)"
      }
    }
  },
  plugins: []
};
