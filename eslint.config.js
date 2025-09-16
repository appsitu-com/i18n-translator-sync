const tseslint = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');
const unusedImports = require('eslint-plugin-unused-imports');
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname
      },
      globals: {
        // Add globals commonly used in Node.js and browser environments
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
        TextDecoder: 'readonly',
        NodeJS: 'readonly',
        structuredClone: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports
    },
    rules: {
      // Turn off base rules as they can report incorrect errors
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'error',
      'no-useless-escape': 'warn',

      // Use the unused-imports plugin rules instead
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_'
        }
      ]
    }
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      '.vscode-test/**',
      '*.vsix',
      'eslint.config.js',
      '**/*.d.ts'  // Ignore declaration files
    ]
  }
];