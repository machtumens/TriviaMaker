#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STAGE_DIR = path.join(ROOT, 'src', 'stage')

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

const SRC_DIR = path.join(ROOT, 'src')
const REDACTION_OWNER = path.join('src', 'engine', 'broadcast.ts')
const broadcastCallers = []

for (const file of await collectTsFiles(SRC_DIR)) {
  const relative = path.relative(ROOT, file)
  if (relative === REDACTION_OWNER || relative.endsWith('.test.ts')) continue
  const lines = (await readFile(file, 'utf8')).split('\n')
  lines.forEach((line, index) => {
    if (/\.broadcast\s*\(/.test(line)) {
      broadcastCallers.push({ file: relative, line: index + 1, source: line.trim() })
    }
  })
}

if (broadcastCallers.length > 0) {
  console.error('✗ redaction boundary: handle.broadcast() called outside broadcast.ts\n')
  for (const caller of broadcastCallers) {
    console.error(`  ${caller.file}:${caller.line}`)
    console.error(`    ${caller.source}`)
  }
  console.error(`\n  ${REDACTION_OWNER} redacts answers before they reach a client.`)
  console.error('  Any other caller sends an unredacted payload to the projector.')
  process.exit(1)
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

console.log(
  `✓ stage/host isolation: ${files.length} stage file(s) checked, no host imports; ` +
  `handle.broadcast() confined to ${REDACTION_OWNER}`,
)
