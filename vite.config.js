import { defineConfig } from 'vite';

export default defineConfig({
  // './' keeps asset paths relative, so `npm run build` also works on GitHub Pages.
  base: './',
  server: { open: true },
});
