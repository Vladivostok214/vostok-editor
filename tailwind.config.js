/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'TikTok Sans Variable'", 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        editor: {
          bg: '#0d0f12',
          panel: '#15181e',
          surface: '#1d222a',
          border: '#282f3a',
          accent: '#00d2ff',
          accentHover: '#33dbff',
        }
      }
    },
  },
  plugins: [],
}
