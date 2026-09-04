import { defineConfig } from 'vitest/config';

// The service layer (services/, models/) is plain TypeScript with no
// React Native runtime — it runs under Node directly, so the tests need no
// jest-expo/react-native preset. Keep `include` scoped to service tests so
// Vitest never tries to load a component file that imports 'react-native'.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/services/**/*.test.ts', 'src/models/**/*.test.ts'],
  },
});
