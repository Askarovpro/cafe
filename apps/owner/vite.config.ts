import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  plugins: [react()],
  resolve: { alias: {
    '@b2b/shared': src('../../packages/shared/src/index.ts'),
    '@b2b/web-kit': src('../../packages/web-kit/src/index.ts'),
  } },
  server: { port: 5179 },
});
