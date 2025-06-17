/** @type {import('tailwindcss').Config} */

export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
        '3xl': '1792px',
      },
    }
  },
  plugins: []
}
