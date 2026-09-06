#!/usr/bin/env tsx
// Validates question packets without starting a show.
//
//   npm run check-packet                       — every packet in packets/
//   npm run check-packet path/to/one.csv       — just that file

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { readPacketText, formatProblems, hasErrors, isPacketPath } from '../src/config/packet'

const DEFAULT_DIR = 'packets'

async function targets(): Promise<string[]> {
  const args = process.argv.slice(2)
  if (args.length > 0) return args

  try {
    const entries = await readdir(DEFAULT_DIR)
    return entries.filter(isPacketPath).sort().map(name => path.join(DEFAULT_DIR, name))
  } catch {
    return []
  }
}

const files = await targets()
if (files.length === 0) {
  console.error(`no packets to check — pass a path, or put .json files in ${DEFAULT_DIR}/`)
  process.exit(1)
}

let failed = 0

for (const file of files) {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    console.log(`✗ ${file}`)
    console.log(`  ✗ ${error instanceof Error ? error.message : String(error)}`)
    failed++
    continue
  }

  const { bank, problems } = readPacketText(text, file)
  const broken = hasErrors(problems)
  if (broken) failed++

  if (bank) {
    const questions = bank.categories.reduce((total, category) => total + category.questions.length, 0)
    console.log(`✓ ${file} — "${bank.title}" (${bank.categories.length} categories, ${questions} questions)`)
  } else {
    console.log(`✗ ${file}`)
  }
  for (const line of formatProblems(problems)) console.log(line)
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} packet(s) have errors`)
  process.exit(1)
}
console.log(`\n${files.length} packet(s) OK`)
