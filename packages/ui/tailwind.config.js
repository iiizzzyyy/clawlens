/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          300: '#ff9999',
          400: '#ff7070',
          500: '#ff5c5c',
          600: '#e04545',
          900: '#3d1515',
        },
      },
    },
  },
  plugins: [],
};
