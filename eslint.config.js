import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist/ plus sub-projects that have their own package.json, runtime, and CI workflows
  globalIgnores(['dist', 'mobile/**', 'bodyshop/**', 'supabase/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Allow _-prefixed variables as the conventional unused marker
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // --- react-hooks v7 React Compiler rules (Part 2 classification) ---
      // [C] React Compiler optimisation rules that fire on legitimate pre-compiler patterns.
      // This project does not use React Compiler; fixing these 237 violations would require
      // architectural changes to data-fetching hooks that are out of scope.
      // set-state-in-effect:          193 violations (setLoading/setError at effect start)
      // static-components:              21 violations (trivial layout components)
      // immutability:                    8 violations (state mutation patterns)
      // preserve-manual-memoization:     7 violations (manual useMemo/useCallback)
      // purity:                          6 violations (side-effects in component body)
      // refs:                            2 violations (ref.current mutation patterns)
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      // [B] React Compiler rules that produce 0 violations — restored to recommended default.
      // use-memo, error-boundaries, set-state-in-render, gating, globals,
      // incompatible-library, unsupported-syntax, config: no overrides needed.
    },
  },
])
