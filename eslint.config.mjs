// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Formatting is owned by Prettier, which self-closes void elements
    // (<input />) the opposite way this rule wants. Avoid fighting it.
    'vue/html-self-closing': 'off',
  },
})
