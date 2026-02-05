/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,tsx,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neon-green': '#39FF14',
        'vibrant-blue': '#007AFF',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
