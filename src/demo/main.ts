import { installEventSourceShim, memoryTransport, dispatch, subscribe } from './memory'

installEventSourceShim()

import('./run').catch((error: unknown) => {
  const root = document.getElementById('root')
  if (root) root.textContent = error instanceof Error ? error.message : String(error)
  console.error(error)
})

export { memoryTransport, dispatch, subscribe }
