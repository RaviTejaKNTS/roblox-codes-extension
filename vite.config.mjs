import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2019',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'content.js'),
        background: resolve(__dirname, 'background.js')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'icons', dest: '.' }
      ]
    })
  ]
});
