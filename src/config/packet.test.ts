import assert from 'node:assert/strict'
import {
  readPacket, bindPackets, stampLadderPoints, fitReport, hasErrors, slug,
} from './packet'
import { resolveConfig } from './resolve'
import type { GameShowConfigInput, GridStyle, QuestionBank, Round } from './types'

const minimal = {
  packet: 1,
  title: 'Science Basics',
  categories: [
    {
      title: 'Space',
      questions: [
        { prompt: 'Red planet?', answer: 'Mars' },
        { prompt: 'Our galaxy?', answer: 'The Milky Way', accept: ['Milky Way'] },
      ],
    },
    {
      title: 'Numbers',
      questions: [
        { prompt: '12 × 12?', answer: 144 },
        { prompt: 'Sides on a hexagon?', answer: 'Six', note: 'Accept 6' },
      ],
    },
  ],
}

{
  const { bank, problems } = readPacket(minimal, 'minimal.json')
  assert.ok(bank, 'a packet with only prompts and answers loads')
  assert.equal(hasErrors(problems), false, 'no errors')
  assert.equal(bank.id, 'science-basics', 'id is slugged from the title')
  assert.equal(bank.categories[0]?.id, 'space', 'category ids are slugged')

  const first = bank.categories[0]?.questions[0]
  assert.equal(first?.id, 'science-basics/space-1', 'question ids are namespaced by packet')
  assert.equal(first?.kind, 'text', 'kind defaults to text')
  assert.equal(first?.points, undefined, 'points are left for the round ladder to supply')

  assert.deepEqual(bank.categories[0]?.questions[1]?.acceptedAnswers, ['Milky Way'], 'accept maps through')
  assert.equal(bank.categories[1]?.questions[0]?.answer, '144', 'numeric answers are read as text')
  assert.equal(bank.categories[1]?.questions[1]?.hostNote, 'Accept 6', 'note maps to hostNote')
}

{
  const { problems } = readPacket({ ...minimal, packet: undefined }, 'noversion.json')
  assert.equal(hasErrors(problems), false, 'a missing version is only a warning')
  assert.match(problems[0]?.message ?? '', /assuming format version 1/)
}

{
  const { bank, problems } = readPacket({
    packet: 1,
    title: 'Broken',
    categories: [{ title: 'Words', questions: [{ prompt: 'No answer here' }] }],
  }, 'broken.json')
  assert.equal(bank, null, 'a question without an answer fails the packet')
  const problem = problems.find(entry => entry.level === 'error')
  assert.match(problem?.where ?? '', /Words › question 1/, 'the error names the row')
  assert.match(problem?.message ?? '', /"answer" is required/)
}

{
  const { bank, problems } = readPacket({
    packet: 1, title: 'Uneven',
    categories: [
      { title: 'A', questions: [{ prompt: 'a1', answer: 'x' }, { prompt: 'a2', answer: 'x' }] },
      { title: 'B', questions: [{ prompt: 'b1', answer: 'x' }] },
    ],
  }, 'uneven.json')
  assert.ok(bank, 'uneven columns still load')
  assert.match(problems[0]?.message ?? '', /different numbers of questions/, 'but they warn')
}

{
  const { problems } = readPacket({
    packet: 1, title: 'Media', categories: [{ title: 'A', questions: [{ prompt: 'p', answer: 'a', kind: 'image' }] }],
  }, 'media.json')
  assert.ok(hasErrors(problems), 'a kind this build cannot play is rejected up front')
  assert.match(problems[0]?.message ?? '', /only "text" questions run/)
}

{
  const { problems } = readPacket({ packet: 99, title: 'Future', categories: [] }, 'future.json')
  assert.ok(hasErrors(problems), 'a newer format version is refused')
}

{
  assert.equal(slug('Film & TV'), 'film-tv')
  assert.equal(slug('  Space  '), 'space')
}

// Two packets that both contain a "Space" category must not shadow each other.
{
  const a = readPacket({ packet: 1, title: 'Pack A', categories: [{ title: 'Space', questions: [{ prompt: 'p', answer: 'a' }] }] }, 'a.json').bank
  const b = readPacket({ packet: 1, title: 'Pack B', categories: [{ title: 'Space', questions: [{ prompt: 'q', answer: 'b' }] }] }, 'b.json').bank
  assert.ok(a && b)
  assert.notEqual(
    a.categories[0]?.questions[0]?.id,
    b.categories[0]?.questions[0]?.id,
    'same category title in two packets yields different question ids',
  )

  const bound = bindPackets({ meta: { id: 'x', title: 'X' } }, [a, b])
  assert.equal(bound.content?.banks?.length, 2, 'both banks bind')
}

{
  const bank: QuestionBank = { id: 'dup', title: 'Dup', categories: [] }
  assert.throws(
    () => bindPackets({ meta: { id: 'x', title: 'X' } }, [bank, { ...bank }]),
    /two question banks share the id "dup"/,
  )
}

{
  const shared = { id: 'q1', kind: 'text' as const, prompt: 'p', answer: 'a' }
  assert.throws(
    () => bindPackets({ meta: { id: 'x', title: 'X' } }, [
      { id: 'one', title: 'One', categories: [{ id: 'c', title: 'C', questions: [shared] }] },
      { id: 'two', title: 'Two', categories: [{ id: 'c', title: 'C', questions: [shared] }] },
    ]),
    /question id "q1" appears in both "one" and "two"/,
  )
}

// Helpers are `function` declarations, not `const x = (): T => ({...})`: TS 7.0.2
// misparses an arrow that returns a parenthesised object when the next statement
// is a bare `{` block, which is how every test in this repo is written.
function gridRound(id: string, categoryIds: string[], pointLadder: number[]): Round {
  const style: GridStyle = {
    kind: 'grid', columns: categoryIds.length, rows: pointLadder.length, pointLadder,
    selection: 'freePick', showCategoryHeaders: true, consumedStyle: 'dim',
    dramaticCategoryReveal: false,
  }
  return { id, title: id, bankId: 'pack', categoryIds, style }
}

function showWith(rounds: Round[], banks: QuestionBank[]): GameShowConfigInput {
  return { meta: { id: 'test', title: 'Test' }, program: { rounds }, content: { banks } }
}

function twoCategoryBank(): QuestionBank {
  return {
    id: 'pack',
    title: 'Pack',
    categories: [
      { id: 'space', title: 'Space', questions: [
        { id: 'pack/space-1', kind: 'text', prompt: 'p1', answer: 'a' },
        { id: 'pack/space-2', kind: 'text', prompt: 'p2', answer: 'a' },
      ] },
      { id: 'words', title: 'Words', questions: [
        { id: 'pack/words-1', kind: 'text', prompt: 'p3', answer: 'a' },
        { id: 'pack/words-2', kind: 'text', prompt: 'p4', answer: 'a', points: 999 },
      ] },
    ],
  }
}

{
  const config = stampLadderPoints(resolveConfig(
    showWith([gridRound('r1', ['space', 'words'], [100, 200])], [twoCategoryBank()]),
  ))
  const [space, words] = config.content.banks[0]?.categories ?? []
  assert.equal(space?.questions[0]?.points, 100, 'row 0 takes the first ladder value')
  assert.equal(space?.questions[1]?.points, 200, 'row 1 takes the second')
  assert.equal(words?.questions[1]?.points, 999, 'an explicit points value is never overwritten')
}

{
  // The same packet, two rounds, different ladders — legal while the categories differ.
  const config = stampLadderPoints(resolveConfig(showWith(
    [gridRound('r1', ['space'], [100, 200]), gridRound('r2', ['words'], [200, 400])],
    [twoCategoryBank()],
  )))
  const [space, words] = config.content.banks[0]?.categories ?? []
  assert.equal(space?.questions[0]?.points, 100)
  assert.equal(words?.questions[0]?.points, 200, 'the second round applies its own ladder')
}

{
  assert.throws(
    () => stampLadderPoints(resolveConfig(showWith(
      [gridRound('r1', ['space'], [100, 200]), gridRound('r2', ['space'], [200, 400])],
      [twoCategoryBank()],
    ))),
    /played by round "r1" at 100 points and by round "r2" at 200 points/,
    'the same question at two values is refused rather than silently mis-scored',
  )
}

{
  const config = resolveConfig(
    showWith([gridRound('r1', ['space', 'words'], [100, 200, 300])], [twoCategoryBank()]),
  )
  const problems = fitReport(config)
  assert.equal(problems.length, 2, 'both short categories are reported')
  assert.match(problems[0]?.message ?? '', /has 2 question\(s\) but the ladder needs 3/)
  assert.equal(hasErrors(problems), false, 'a short board is a warning, not a refusal')
}

{
  const config = resolveConfig(
    showWith([gridRound('r1', ['space', 'words'], [100, 200])], [twoCategoryBank()]),
  )
  assert.deepEqual(fitReport(config), [], 'a board that fits reports nothing')
}

console.log('\u2713 packets: all checks passed')
