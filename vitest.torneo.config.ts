import { defineConfig } from 'vitest/config';

// Configuración del torneo IA contra IA (npm run torneo). No forma parte de los tests normales.
export default defineConfig({
  test: { include: ['tournament/**/*.test.ts'], testTimeout: 30 * 60_000, silent: false },
});
