#!/usr/bin/env node

import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = path.join(ROOT, 'src')
const TEST_SUFFIX = '.test.ts'

async function collectTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectTests(full))
    else if (entry.name.endsWith(TEST_SUFFIX)) files.push(full)
  }
  return files
}

const files = (await collectTests(SRC)).sort()
if (files.length === 0) {
  console.error('✗ no test files found under src/')
  process.exit(1)
}

const failures = []
const started = Date.now()

for (const file of files) {
  const name = path.relative(ROOT, file)
  try {
    await import(pathToFileURL(file).href)
    console.log(`PASS ${name}`)
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    console.log(`FAIL ${name}`)
    failures.push({ name, message })
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1)

if (failures.length > 0) {
  console.error(`\n${failures.length} of ${files.length} test file(s) failed:\n`)
  for (const failure of failures) {
    console.error(`--- ${failure.name} ---`)
    console.error(failure.message)
    console.error('')
  }
  process.exit(1)
}

console.log(`\n${files.length} test file(s) passed in ${elapsed}s`)
