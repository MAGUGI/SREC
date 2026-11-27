import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // `title` is not an accessible name. Inputs keep the plugin's default
      // ignore list: label-has-associated-control already covers them.
      'jsx-a11y/control-has-associated-label': [
        'error',
        {
          labelAttributes: ['aria-label'],
          controlComponents: ['IconButton'],
          ignoreElements: ['audio', 'canvas', 'embed', 'input', 'textarea', 'tr', 'video'],
        },
      ],
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      // Portões de qualidade estrutural (OPS-03, fase 1): warn.
      complexity: ['warn', { max: 10 }],
      'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', { max: 3 }],
      eqeqeq: ['warn', 'smart'],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['**/*.test.{js,jsx}'],
    rules: { 'max-lines': 'off', 'max-lines-per-function': 'off' },
  },
  prettierConfig,
];
