import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import { architectureRules } from './scripts/eslint-architecture-rules.ts';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.stryker-tmp/**',
      'reports/**',
      'site/**',
      'fixtures/**',
      'src/scanner/fixtures/**',
      'benchmarks/projects/**',
    ],
  },
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        performance: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        NodeJS: 'readonly',
      },
    },
  },
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: './tsconfig.json', sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint, dokimana: { rules: architectureRules } },
    rules: {
      ...tseslint.configs['strict-type-checked'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'dokimana/no-import-cycles': 'error',
      'dokimana/no-unused-exports': 'error',
    },
  },
  prettier,
];
