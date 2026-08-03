import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

/**
 * One lint configuration for the whole monorepo.
 *
 * Deliberately not type-aware: type-aware linting needs a TypeScript program
 * per workspace and roughly triples the run time. `npm run typecheck` already
 * covers what the type system can catch, and it runs in the same CI job.
 *
 * `eslint-config-prettier` is last so formatting rules never fight Prettier.
 */
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'npm-cache/**', 'coverage/**', '**/*.d.ts'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Leading underscore marks a binding as intentionally unused.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` defeats the shared contract. Use `unknown` and narrow it.
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  prettier,
]
