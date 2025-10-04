/** @type {import('tailwindcss').Config} */
module.exports = {
  // CRITICAL: Tells Tailwind to scan your JSX file for classes
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
