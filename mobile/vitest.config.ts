import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  define: {
    __DEV__: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    alias: {
      'react-native': path.resolve(__dirname, 'src/test/mocks/react-native.ts'),
    },
  },
})
