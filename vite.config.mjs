import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const local = path => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  base: './',
  resolve: { alias: [
    { find: /^monaco-vim$/, replacement: local('./node_modules/monaco-vim/dist/index.mjs') },
    { find: /^monaco-editor\/esm\/vs\/editor\/editor\.api$/, replacement: local('./node_modules/monaco-editor/esm/vs/editor/editor.api.js') },
    { find: /^monaco-editor\/esm\/vs\/editor\/common\/commands\/shiftCommand$/, replacement: local('./node_modules/monaco-editor/esm/vs/editor/common/commands/shiftCommand.js') },
  ] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist' },
});
