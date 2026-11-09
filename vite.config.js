import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Збирає весь додаток в ОДИН html-файл (dist/index.html),
// який можна просто відкрити в браузері або викласти на GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
});
