/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nkb: {
          navy: '#0f2a4a',
          'navy-light': '#1b3f6b',
          'navy-dark': '#091a2e',
          slate: '#1e293b',
          gold: '#d97706',
          'gold-light': '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
