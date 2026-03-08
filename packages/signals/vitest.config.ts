import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks', // --expose-gc doesn't work with threads
    poolOptions: {
      forks: {
        execArgv: ['--expose-gc'],
      },
    },
    include: ['__tests__/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
});
