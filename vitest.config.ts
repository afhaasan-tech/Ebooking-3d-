import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/api/src/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
