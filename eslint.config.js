const js = require('@eslint/js')
const globals = require('globals')

let tsParser = null
let tsPlugin = null

try {
  tsParser = require('@typescript-eslint/parser')
  tsPlugin = require('@typescript-eslint/eslint-plugin')
} catch {
  tsParser = null
  tsPlugin = null
}

module.exports = [
  {
    ...js.configs.recommended,
    files: ['**/*.{js,jsx,mjs,cjs}'],
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['__tests__/**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
  },
  ...(tsParser && tsPlugin
    ? [
        {
          files: ['**/*.{ts,tsx}'],
          languageOptions: {
            parser: tsParser,
            parserOptions: {
              ecmaVersion: 'latest',
              sourceType: 'module',
            },
            globals: {
              ...globals.browser,
              ...globals.node,
            },
          },
          plugins: {
            '@typescript-eslint': tsPlugin,
          },
          rules: {
            ...tsPlugin.configs.recommended.rules,
            'no-undef': 'off',
            '@typescript-eslint/no-unused-vars': [
              'error',
              {
                varsIgnorePattern: '^_',
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
              },
            ],
          },
        },
        {
          files: ['src/features/**/*.{ts,tsx}'],
          rules: {
            'no-restricted-imports': [
              'error',
              {
                patterns: [
                  {
                    group: ['**/src/features/*/*', '**/features/*/*'],
                    message:
                      'Do not import feature internals from other features. Export through feature public API or move shared logic to src/domain.',
                  },
                ],
              },
            ],
          },
        },
        {
          files: ['src/db/**/*.{ts,tsx}'],
          rules: {
            'no-restricted-imports': [
              'error',
              {
                patterns: [
                  {
                    group: [
                      '**/src/features/**',
                      '**/src/components/**',
                      '**/features/**',
                      '**/components/**',
                    ],
                    message: 'DB layer must not depend on UI/features.',
                  },
                ],
              },
            ],
          },
        },
      ]
    : []),
  {
    ignores:
      tsParser && tsPlugin
        ? ['node_modules/**', 'dist/**', 'coverage/**']
        : ['node_modules/**', 'dist/**', 'coverage/**', '**/*.{ts,tsx}'],
  },
]
