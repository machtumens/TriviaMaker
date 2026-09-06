import assert from 'node:assert/strict'
import { parseCsv, csvToPacket } from './csv'
import { readPacketText, titleFromSource, hasErrors } from './packet'

{
  const rows = parseCsv('a,b,c\n1,2,3\n')
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', '2', '3']], 'plain rows')
}
{
  const rows = parseCsv('a,b\n"one, two",three')
  assert.deepEqual(rows[1], ['one, two', 'three'], 'a quoted field keeps its commas')
}
{
  const rows = parseCsv('a\n"he said ""hi"""')
  assert.deepEqual(rows[1], ['he said "hi"'], 'doubled quotes are one quote')
}
{
  const rows = parseCsv('a,b\n"line one\nline two",x')
  assert.equal(rows.length, 2, 'a newline inside quotes does not end the row')
  assert.deepEqual(rows[1], ['line one\nline two', 'x'])
}
{
  const rows = parseCsv('a\nhe said "hi" ok')
  assert.deepEqual(rows[1], ['he said "hi" ok'], 'bare quotes mid-field are literal, not delimiters')
}
{
  const rows = parseCsv('a\nhe said "hi" ok')
  assert.deepEqual(rows[1], ['he said "hi" ok'], 'bare quotes mid-field are literal, not delimiters')
}
{
  const rows = parseCsv('﻿category,prompt\nSpace,p')
  assert.equal(rows[0]?.[0], 'category', 'the byte order mark Excel writes is stripped')
}
{
  const rows = parseCsv('a,b\n\n\n1,2\n   \n')
  assert.equal(rows.length, 2, 'blank lines are skipped')
}
{
  const rows = parseCsv('a,b\r\n1,2\r\n')
  assert.deepEqual(rows[1], ['1', '2'], 'windows line endings')
}

const SHEET = [
  'Topic,Question,Answer,Accept,Note',
  'Space,Red planet?,Mars,,',
  'Space,Our galaxy?,The Milky Way,Milky Way|The Galaxy,',
  'Words,Letters in the alphabet?,26,,Accept "twenty-six"',
].join('\n')

{
  const { object, problems } = csvToPacket(SHEET, 'sheet.csv', 'Sheet')
  assert.equal(hasErrors(problems), false, 'header aliases are accepted')

  const packet = object as { title: string; categories: Array<{ title: string; questions: unknown[] }> }
  assert.equal(packet.title, 'Sheet', 'the title falls back to the one supplied')
  assert.deepEqual(packet.categories.map(category => category.title), ['Space', 'Words'], 'categories keep first-seen order')
  assert.equal(packet.categories[0]?.questions.length, 2, 'rows group under their category')

  const second = packet.categories[0]?.questions[1] as { accept: string[] }
  assert.deepEqual(second.accept, ['Milky Way', 'The Galaxy'], 'alternatives split on a pipe')

  const third = packet.categories[1]?.questions[0] as { note: string }
  assert.equal(third.note, 'Accept "twenty-six"', 'notes carry through')
}

{
  const { object, problems } = csvToPacket('category,prompt\nSpace,p', 'x.csv', 'X')
  assert.equal(object, null)
  assert.match(problems[0]?.message ?? '', /missing "answer"/, 'a missing column is named')
  assert.match(problems[0]?.message ?? '', /found "category", "prompt"/, 'and so is what was found instead')
  assert.equal(problems[0]?.where, 'x.csv row 1')
}

{
  const sheet = 'category,prompt,answer\nSpace,p1,a1\nSpace,p2,\nSpace,p3,a3'
  const { object, problems } = csvToPacket(sheet, 'x.csv', 'X')
  assert.equal(object, null, 'one bad row fails the sheet')
  assert.equal(problems[0]?.where, 'x.csv row 3', 'reported at the spreadsheet row the author sees')
  assert.match(problems[0]?.message ?? '', /"answer" is empty/)
}

{
  const { problems } = csvToPacket('category,prompt,answer,points\nS,p,a,lots', 'x.csv', 'X')
  assert.ok(hasErrors(problems), 'points must be a number')
  assert.match(problems[0]?.message ?? '', /not a number: "lots"/)
}

{
  const { object, problems } = csvToPacket('category,prompt,answer\n', 'x.csv', 'X')
  assert.equal(object, null)
  assert.match(problems[0]?.message ?? '', /no question rows/)
}

{
  const sheet = 'category,prompt,answer,title\nSpace,p,a,Friday Quiz\nSpace,p2,a2,'
  const { object } = csvToPacket(sheet, 'x.csv', 'Fallback')
  assert.equal((object as { title: string }).title, 'Friday Quiz', 'a title column wins over the filename')
}

{
  assert.equal(titleFromSource('packets/general-knowledge.csv'), 'General Knowledge')
  assert.equal(titleFromSource('week_3.csv'), 'Week 3')
  assert.equal(titleFromSource('/tmp/quiz.json'), 'Quiz')
}

// End to end: a sheet becomes a bank the engine can play.
{
  const { bank, problems } = readPacketText(SHEET, 'packets/friday-quiz.csv')
  assert.equal(hasErrors(problems), false)
  assert.ok(bank)
  assert.equal(bank.id, 'friday-quiz', 'the id comes from the filename')
  assert.equal(bank.categories[0]?.questions[0]?.id, 'friday-quiz/space-1', 'ids are generated as for JSON')
  assert.equal(bank.categories[1]?.questions[0]?.answer, '26', 'a numeric answer stays text')
  assert.equal(bank.categories[0]?.questions[0]?.points, undefined, 'points still come from the round ladder')
}

{
  const { bank, problems } = readPacketText('{ not json', 'x.json')
  assert.equal(bank, null)
  assert.match(problems[0]?.message ?? '', /not valid JSON/, 'a syntax error is reported, not thrown')
}

console.log('✓ csv packets: all checks passed')
