import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    css: { include: [/scorebook\.css/] },
    maxWorkers: 2,
    // Multi-screen jsdom workflows can exceed 5s on shared CI runners; assertions remain unchanged.
    testTimeout: 15000,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
