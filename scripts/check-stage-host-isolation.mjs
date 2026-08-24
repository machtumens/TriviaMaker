#!/usr/bin/env node
/**
 * Stage/host bundle isolation — SPEC AC#7 (bundle half).
 *
 * The stage bundle must not be able to reach the host bundle. Redaction at the
 * transport boundary keeps answers out of the stage PAYLOAD; this keeps them out
 * of the stage BUNDLE. Two independent mechanisms, because "the projector showed
 * the answer key" is not a bug you get to fix after the fact.
 *
 * Source-level only: it reads import specifiers, it does not walk the built
 * graph. A transitive import through a third module would not be caught here —
 * that would need bundle analysis, which is future work.
 *
 * Exit 0 = clean. Exit 1 = a forbidden import, printed with file and line.
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STAGE_DIR = path.join(ROOT, 'src', 'stage')

/** Path-segment boundaries stop `hostNote` / `hosting` from matching. */
const FORBIDDEN = [
  /(^|\/)\.\.\/host(\/|$)/,
  /(^|\/)host\//,
]

const SPECIFIER_PATTERNS = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]

async function collectTsFiles(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectTsFiles(full))
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

const files = await collectTsFiles(STAGE_DIR)
const violations = []

for (const file of files) {
  const lines = (await readFile(file, 'utf8')).split('\n')
  lines.forEach((line, index) => {
    for (const pattern of SPECIFIER_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(line)) !== null) {
        const specifier = match[1]
        if (FORBIDDEN.some(rule => rule.test(specifier))) {
          violations.push({
            file: path.relative(ROOT, file),
            line: index + 1,
            specifier,
            source: line.trim(),
          })
        }
      }
    }
  })
}

if (violations.length > 0) {
  console.error('✗ stage/host isolation: forbidden imports found\n')
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  imports "${violation.specifier}"`)
    console.error(`    ${violation.source}`)
  }
  console.error('\n  src/stage/** must never import from src/host/**.')
  process.exit(1)
}

console.log(`✓ stage/host isolation: ${files.length} stage file(s) checked, no host imports`)
