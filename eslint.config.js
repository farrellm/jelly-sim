import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/dev-dist/**',
      'apps/api/src/db/migrations/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },

  // DESIGN.md §4.2 — determinism rules for the simulation core.
  //
  // These are not style preferences. The client and the server both run @jelly/sim and
  // must reach byte-identical conclusions from the same inputs, so the package cannot
  // read the clock, roll its own dice, or touch the outside world. Time arrives as a
  // parameter; randomness comes from PlayerState.rng.
  {
    files: ['packages/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'performance',
          message: '§4.2: no ambient time. Pass the instant in as a parameter.',
        },
        { name: 'fetch', message: '§4.2: @jelly/sim performs no I/O.' },
        { name: 'setTimeout', message: '§4.2: @jelly/sim is pure; it does not schedule.' },
        { name: 'setInterval', message: '§4.2: @jelly/sim is pure; it does not schedule.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: '§4.2: no ambient time. Pass the instant in as a parameter.',
        },
        {
          object: 'Math',
          property: 'random',
          message: '§4.2: no ambient randomness. Use the seeded PRNG in rng.ts.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: '§4.2: no ambient time. Pass the instant in as a parameter.',
        },
        {
          selector: 'ImportDeclaration[source.value=/^(node:|fs$|path$|crypto$)/]',
          message: '§4.2: @jelly/sim performs no I/O and imports nothing outside @jelly/shared.',
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },
);
