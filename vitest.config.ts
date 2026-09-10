import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/main/**/*.{test,spec}.{ts,tsx}', 'tests/unit/**/*.{test,spec}.{ts,tsx}']
        }
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
          passWithNoTests: true
        }
      }
    ]
  }
})
