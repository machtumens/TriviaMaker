import assert from 'node:assert/strict'
import '../registry/bootstrap'
import { validateConfigPlugins } from '../registry/index'
import { resolveConfig } from '../config/resolve'
import { fitReport, hasErrors, readPacketText, stampLadderPoints } from '../config/packet'
import { blankQuizQuestions as blank } from './draft'
import {
  applyHeatsAndFinal, dealQuestions, defaultDraft, draftToConfig, feudQuestionsFromBank,
  hexToRgba, importBankIntoRound, loadDraft, newRound, saveDraft, shuffleHeats, upgradeDraft,
  type Draft, type FeudQuestion,
} from './draft'

/** A Studio draft has to produce a config the engine will actually run. */
function build(draft: Draft) {
  const config = stampLadderPoints(resolveConfig(draftToConfig(draft)))
  assert.deepEqual(validateConfigPlugins(config), [], 'every plugin key resolves')
  assert.equal(hasErrors(fitReport(config)), false, 'the board fits the content')
  return config
}

/** Sixteen questions, the way the packet that ships has sixteen. */
function pool(count: number): FeudQuestion[] {
  const questions: FeudQuestion[] = []
  for (let index = 0; index < count; index++) {
    questions.push({
      prompt: `Question ${index + 1}`,
      answers: [
        { text: 'A', count: 30 },
        { text: 'B', count: 20 },
        { text: 'C', count: 10 },
      ],
    })
  }
  return questions
}

{
  // The default show: four heats of four groups, then a final between the winners.
  const draft = dealQuestions(defaultDraft(), pool(16))
  const config = build(draft)

  assert.equal(config.program.rounds.length, 5, 'four heats and a final')
  assert.equal(config.teams.teams.length, 16, 'sixteen groups')
  assert.equal(config.program.carryScores, false, 'every heat and the final start level')

  const heats = config.program.rounds.slice(0, 4)
  heats.forEach((heat, index) => {
    assert.deepEqual(
      heat.teamIds,
      [1, 2, 3, 4].map(seat => `t${index * 4 + seat}`),
      `heat ${index + 1} plays its own four groups`,
    )
    assert.equal(heat.advanceTop, 1, 'one winner leaves each heat')
  })

  const final = config.program.rounds[4]!
  assert.equal(final.teamIds, undefined, 'the final names nobody — the survivors ARE the finalists')
  assert.equal(final.advanceTop, undefined, 'and nobody is cut at the end of it')

  const perRound = config.content.banks.map(bank =>
    bank.categories[0]!.questions.length)
  assert.deepEqual(perRound, [3, 3, 3, 3, 4], 'sixteen questions: three a heat, four in the final')

  const prompts = config.content.banks.flatMap(bank =>
    bank.categories[0]!.questions.map(question => question.prompt))
  assert.equal(new Set(prompts).size, 16, 'no question is dealt twice')

  const question = config.content.banks[0]!.categories[0]!.questions[0]!
  assert.equal(question.kind, 'survey', 'feud questions are survey questions')
  assert.equal(question.surveyAnswers?.length, 3, 'answers survive the crossing')
}

{
  // Rebuilding an existing show into the heats shape keeps its questions.
  const draft = dealQuestions(defaultDraft(), pool(16))
  draft.teams = draft.teams.slice(0, 8)
  const rebuilt = applyHeatsAndFinal(draft)

  assert.equal(rebuilt.rounds.length, 5, 'still four heats and a final')
  assert.deepEqual(
    rebuilt.rounds.slice(0, 4).map(round => round.teamIds.length), [2, 2, 2, 2],
    'eight groups deal two to a heat',
  )
  assert.equal(
    new Set(rebuilt.rounds.flatMap(round => round.teamIds)).size, 8,
    'and every group is in exactly one heat',
  )
  const total = rebuilt.rounds.reduce((sum, round) => sum + round.feud.questions.length, 0)
  assert.equal(total, 16, 'every question survives the rebuild')
  build(rebuilt)
}

{
  // The draw: same shape, different groups in it.
  let seed = 7
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }

  const draft = shuffleHeats(dealQuestions(defaultDraft(), pool(16)), rng)
  const heats = draft.rounds.slice(0, 4)

  assert.deepEqual(
    heats.map(heat => heat.teamIds.length), [4, 4, 4, 4],
    'every heat keeps the number of groups it had',
  )
  const drawn = heats.flatMap(heat => heat.teamIds)
  assert.equal(new Set(drawn).size, 16, 'every group is drawn exactly once')
  assert.notDeepEqual(
    heats[0]!.teamIds, ['t1', 't2', 't3', 't4'],
    'the draw is not the sequential order it started from',
  )
  assert.deepEqual(draft.rounds[4]!.teamIds, [], 'the final still names nobody')

  const config = build(draft)
  assert.deepEqual(
    config.program.rounds[0]!.teamIds, heats[0]!.teamIds,
    'the drawn roster is what reaches the engine',
  )
}

{
  const draft = defaultDraft()
  draft.rounds[0]!.teamIds = ['t1', 't99']
  const config = build(dealQuestions(draft, pool(16)))
  assert.deepEqual(
    config.program.rounds[0]!.teamIds, ['t1'],
    'a roster entry for a team that no longer exists never reaches the engine',
  )
}

{
  const draft = dealQuestions(defaultDraft(), pool(16))
  const first = draft.rounds[0]!
  first.format = 'quiz'
  first.quiz.categories = [
    { title: 'Category 1', questions: [] },
    { title: 'Category 2', questions: [] },
  ].map(category => ({ ...category, questions: blank(4) }))
  first.quiz.categories = first.quiz.categories.map(category => ({
    ...category,
    questions: category.questions.map((row, index) => ({
      prompt: `Q${index + 1}`,
      answer: `A${index + 1}`,
      accept: index === 0 ? 'other | also' : '',
      note: index === 0 ? 'say it slowly' : '',
    })),
  }))

  const config = build(draft)
  const round = config.program.rounds[0]!
  assert.equal(round.style.kind, 'grid', 'quiz format builds a grid')
  assert.equal(round.categoryIds?.length, 2, 'every column is played')

  const question = config.content.banks[0]!.categories[0]!.questions[0]!
  assert.equal(question.points, 100, 'the ladder stamps the row value onto the question')
  assert.deepEqual(question.acceptedAnswers, ['other', 'also'], 'bar-separated answers split')
  assert.equal(question.hostNote, 'say it slowly', 'the host note rides along')
}

{
  // Several rounds: one bank each, so no id can collide and no ladder can clash.
  const draft = dealQuestions(defaultDraft(), pool(16))
  draft.rounds = draft.rounds.slice(0, 1)
  const second = newRound(1, 'quiz')
  second.name = 'Round 2'
  second.quiz.categories = [
    { title: 'Only', questions: [{ prompt: 'Q', answer: 'A', accept: '', note: '' }] },
  ]
  second.quiz.pointLadder = [100]
  second.advance = 'top'
  second.advanceTop = 3
  second.intermissionText = 'Back in five'
  second.clockMode = 'off'
  draft.rounds.push(second)

  const config = build(draft)
  assert.equal(config.program.rounds.length, 2, 'both rounds are programmed')
  assert.equal(config.content.banks.length, 2, 'each round carries its own bank')

  const ids = config.content.banks.flatMap(bank =>
    bank.categories.flatMap(category => category.questions.map(question => question.id)))
  assert.equal(new Set(ids).size, ids.length, 'question ids are unique across rounds')

  const built = config.program.rounds[1]!
  assert.equal(built.advanceTop, 3, 'the cut reaches the engine')
  assert.equal(built.eliminateLowest, undefined, 'a cut is not also a knockout')
  assert.equal(built.intermissionAfter?.enabled, true, 'the intermission reaches the engine')
  assert.equal(built.overrides?.rules?.timer?.questionSec, null, 'a clockless round overrides the show clock')
}

{
  const draft = dealQuestions(defaultDraft(), pool(16))
  draft.rounds[0]!.advance = 'lowest'
  const config = build(draft)
  assert.equal(config.program.rounds[0]!.eliminateLowest, true, 'knockout reaches the engine')
  assert.equal(config.program.rounds[0]!.advanceTop, undefined, 'and brings no cut with it')
}

{
  // Blank rows are scaffolding in the editor and must not reach the board.
  const draft = dealQuestions(defaultDraft(), pool(16))
  const round = draft.rounds[0]!
  round.format = 'quiz'
  round.quiz.pointLadder = [100]
  round.quiz.categories = [
    { title: 'Only', questions: [{ prompt: 'Q', answer: 'A', accept: '', note: '' }] },
    { title: 'Empty', questions: [{ prompt: '', answer: '', accept: '', note: '' }] },
  ]

  const config = stampLadderPoints(resolveConfig(draftToConfig(draft)))
  assert.equal(config.content.banks[0]!.categories[1]!.questions.length, 0, 'blank rows are dropped')
  assert.equal(hasErrors(fitReport(config)), false, 'an unfilled column is a warning, not an error')
}

{
  const csv = [
    'question,answer,points,title',
    'Name a fruit,APPLE,40,Fruit Feud',
    'Name a fruit,BANANA,30,',
    'Name a vegetable,CARROT,50,',
  ].join('\n')
  const { bank } = readPacketText(csv, 'fruit.csv')
  assert.ok(bank, 'the csv parses')

  const draft = dealQuestions(defaultDraft(), pool(16))
  draft.rounds[0] = importBankIntoRound({ ...newRound(0, 'quiz') }, bank)
  assert.equal(draft.rounds[0]!.format, 'feud', 'survey content switches the round to the survey board')
  assert.equal(draft.rounds[0]!.feud.questions.length, 2, 'both questions arrive')
  assert.equal(draft.rounds[0]!.feud.questions[0]!.answers[0]!.text, 'APPLE', 'answers keep their order')

  build(draft)
}

{
  const draft = dealQuestions(defaultDraft(), pool(16))
  draft.rounds = draft.rounds.slice(0, 1)
  draft.rounds[0]!.teamIds = []
  draft.teams = [{ name: '', color: '#123456', startingScore: 40 }]
  const config = build(draft)
  assert.equal(config.teams.teams[0]!.name, 'Group 1', 'an unnamed team still has a name on the projector')
  assert.equal(config.teams.teams[0]!.id, 't1', 'team ids are positional')
  assert.equal(config.teams.teams[0]!.startingScore, 40, 'a handicap reaches the engine')
}

{
  const draft = dealQuestions(defaultDraft(), pool(16))
  draft.look.bg = '#0b1020'
  draft.look.scrimOpacity = 50
  draft.motion.easing = 'bouncy'
  draft.copy.correct = 'Benar'
  const config = build(draft)
  assert.equal(config.theme.color.scrim, 'rgba(11,16,32,0.5)', 'the scrim is the background at the chosen opacity')
  assert.equal(config.motion.easing.enter.startsWith('cubic-bezier'), true, 'the easing preset expands')
  assert.equal(config.copy.host.correct, 'Benar', 'the host button wording reaches the controls')
}

{
  assert.equal(hexToRgba('#ffffff', 100), 'rgba(255,255,255,1)', 'full opacity')
  assert.equal(hexToRgba('not a colour', 40), 'rgba(0,0,0,0.4)', 'a colour it cannot read falls back to black')
}

{
  // A draft written by the single-round Studio still has to open.
  const legacy = {
    title: 'Old Show',
    format: 'feud',
    introText: 'Round 1',
    feud: { strikesAllowed: 2, showCounts: false, questions: [{ prompt: 'Q', answers: [{ text: 'A', count: 10 }] }] },
    teams: [{ name: 'Alpha', color: '#ff0000' }],
  }
  const draft = upgradeDraft(legacy)
  assert.equal(draft.title, 'Old Show', 'the title survives')
  assert.equal(draft.rounds.length, 1, 'the inline round becomes rounds[0]')
  assert.equal(draft.rounds[0]!.feud.questions.length, 1, 'its questions come with it')
  assert.equal(draft.rounds[0]!.introText, 'Round 1', 'so does the opening card')
  assert.equal(draft.rounds[0]!.advance, 'all', 'a round with no progression set keeps everyone in')
  assert.equal(draft.teams[0]!.startingScore, 0, 'teams gain the fields they never had')
  build(draft)
}

{
  const draft = upgradeDraft({ rounds: [{ id: 'r1', eliminateLowest: true }] })
  assert.equal(draft.rounds[0]!.advance, 'lowest', 'the old elimination flag becomes the new mode')
}

{
  assert.equal(upgradeDraft(null).rounds.length, 5, 'junk in storage still opens the default show')
  assert.deepEqual(upgradeDraft('nonsense').title, defaultDraft().title, 'so does the wrong type entirely')
}

{
  // The draw has to survive the trip through storage: the Studio and the host
  // page are two pages reading the same saved show, and they must agree on who
  // is in which heat.
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
    },
    configurable: true,
  })

  assert.equal(loadDraft(), null, 'nothing saved yet')

  let seed = 11
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const drawn = shuffleHeats(dealQuestions(defaultDraft(), pool(16)), rng)
  saveDraft(drawn)

  const reloaded = loadDraft()
  assert.ok(reloaded, 'the saved show comes back')
  assert.deepEqual(
    reloaded.rounds.map(round => round.teamIds),
    drawn.rounds.map(round => round.teamIds),
    'every heat comes back with the same groups in it',
  )
  assert.deepEqual(
    reloaded.rounds.map(round => round.feud.questions.length), [3, 3, 3, 3, 4],
    'and the questions come back where they were dealt',
  )
  build(reloaded)
}
