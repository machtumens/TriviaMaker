/**
 * Vite serves `import text from './file.csv?raw'` as a string. Declared here
 * rather than pulling in the whole `vite/client` type surface for one import.
 */
declare module '*?raw' {
  const contents: string
  export default contents
}

/** Vite turns a CSS side-effect import into a stylesheet link at build time. */
declare module '*.css' {
  const sheet: string
  export default sheet
}
