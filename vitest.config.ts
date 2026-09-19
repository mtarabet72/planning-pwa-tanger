import { defineConfig } from 'vitest/config';

// Configuration dédiée aux tests, séparée de vite.config.ts (qui embarque le plugin PWA,
// inutile — et potentiellement gênant — pour de simples tests unitaires de fonctions pures).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});