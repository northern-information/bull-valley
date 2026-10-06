/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    // The HUD uses BEM modifiers (.bv-btn--primary), which are not kebab-case.
    'selector-class-pattern': null,
  },
}
