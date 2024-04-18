/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: 'jit',
  purge: [`./views/**/*.ejs`],
  content: [`./views/**/*.ejs`],
  theme: {
    extend: {},
  },
  daisyui: {
    themes: ['cupcake'],
  },
  plugins: [require('@tailwindcss/typography'), require('daisyui')],
}

