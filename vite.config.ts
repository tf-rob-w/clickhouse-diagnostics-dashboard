import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' keeps asset URLs relative so dist/ works from any static host or sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
});
