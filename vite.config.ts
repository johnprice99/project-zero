import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [svelte()],
  // Built pages go with the rest of the build output, where Tauri bundles them from.
  build: { outDir: 'src-tauri/target/web', emptyOutDir: true },
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  clearScreen: false,
});
