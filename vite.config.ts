/**
 * Build config for the two browser bundles.
 *
 * Vite is a BUILD-time tool only. Nothing depends on a dev server at show
 * time — `local.ts` serves `dist/` from the same process that runs the engine,
 * so there is exactly one thing to keep alive during a live event.
 *
 * `root: src` keeps the emitted paths short (`dist/stage/index.html`,
 * `dist/host/index.html`), which is what the `/stage.html` and `/host.html`
 * aliases in `local.ts` point at.
 */

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
      },
    },
  },
})
