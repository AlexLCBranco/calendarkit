import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Round 10: slate.html — the Slate's self-contained part (src/slate/) on a page of its own — built on its own, after the
// app (`npm run build`), into the same dist/ (emptyOutDir off), so the app's own bundle is exactly what it was and this
// one shows what the part weighs by itself (React included).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: false, rollupOptions: { input: { slate: 'slate.html' } } },
});
