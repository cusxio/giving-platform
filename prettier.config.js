/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
  semi: false,
  singleQuote: true,
  objectWrap: 'collapse',
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cx'],
  tailwindStylesheet: './src/styles/globals.css',
}

export default config
