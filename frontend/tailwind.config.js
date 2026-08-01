/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-main)',
        card: 'var(--bg-card)',
        primary: 'var(--text-main)',
        muted: 'var(--text-muted)',
        border: 'var(--border-color)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
      }
    },
  },
  plugins: [],
}
