// ESLint: a small correctness-only rule set (no style rules: formatting is left alone). typescript-eslint's
// recommended rules plus React's two hooks rules, both errors.
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-output/**', 'test-results/**', 'public/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // `_name` marks a value left unused on purpose (a rest-destructured key, a required callback parameter)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Playwright: a test that needs no fixture still destructures its first argument (async ({}, info) => …), and a
    // fixture's use() callback is not React's hook
    files: ['e2e/**'],
    rules: { 'no-empty-pattern': 'off', 'react-hooks/rules-of-hooks': 'off' },
  },
);
