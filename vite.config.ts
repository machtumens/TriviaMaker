import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  root: here('src'),
  base: './',
  build: {
    outDir: here('dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        stage: here('src/stage/index.html'),
        host: here('src/host/index.html'),
        demo: here('src/index.html'),
      },
    },
  },
})
