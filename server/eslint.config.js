const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const security = require('eslint-plugin-security');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        process: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly'
      }
    },
    plugins: { security },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      // Portões de qualidade estrutural (OPS-03, fase 1): warn. `npm run lint:strict`
      // falha com qualquer aviso; promover a 'error' quando chegar a zero.
      complexity: ['warn', { max: 10 }],
      'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', { max: 3 }],
      'max-params': ['warn', { max: 4 }],
      eqeqeq: ['warn', 'smart'],
      ...security.configs.recommended.rules
    }
  },
  {
    files: ['**/*.test.js', 'tests/**/*.js'],
    rules: { 'max-lines': 'off', 'max-lines-per-function': 'off' }
  },
  prettier
];
