/**
 * ============================================================================
 * PLUGIN REGISTRY — the escape hatch for customisation nobody anticipated
 * ============================================================================
 *
 * Config covers what a host wants to CHANGE. Registries cover what a developer
 * wants to ADD. If the core engine ever needs to know a plugin's name, the
 * abstraction has failed.
 *
 * Rule: the engine depends on these INTERFACES only. It never imports a
 * concrete style, scoring engine, or transport.
 */

import type {
  GameShowConfig, RuleSet, Question, Round, GameEventName, RegistryKey,
} from '../config/types'

// ---------------------------------------------------------------------------
// Core session state the engine owns. Plugins receive it read-only and return
// intents; they never mutate it directly. This is what keeps undo coherent.
// ---------------------------------------------------------------------------

export type Phase =
  | 'lobby' | 'roundIntro' | 'board' | 'reading' | 'armed'
  | 'locked' | 'adjudicate' | 'reveal' | 'wager'
  | 'intermission' | 'final'

export interface SessionState {
  readonly id: string
  readonly joinCode: string
  readonly config: GameShowConfig
  readonly phase: Phase
  readonly roundIndex: number
  readonly currentQuestionId: string | null
  readonly consumed: ReadonlySet<string>
  readonly teams: readonly TeamState[]
  readonly players: readonly PlayerState[]
  readonly buzzes: readonly BuzzRecord[]
  readonly turnTeamId: string | null
  readonly attemptsUsed: number
  readonly lockedOutTeamIds: ReadonlySet<string>
  readonly clockStartedAt: number | null
  readonly log: readonly GameEvent[]
}

export interface TeamState {
  id: string; name: string; color: string; score: number
  streak: number; lifelinesUsed: Record<string, number>
  eliminated: boolean
}

export interface PlayerState {
  id: string; name: string; teamId: string | null
  connected: boolean; rttMs: number
}

export interface BuzzRecord {
  playerId: string; teamId: string | null
  /** Server receipt minus estimated one-way latency. */
  estimatedTapTime: number
  rank: number
  /** Gap behind the leader, surfaced to the host for photo finishes. */
  marginMs: number
}

export interface GameEvent {
  seq: number
  at: number
  name: GameEventName
  payload: Record<string, unknown>
  /** Inverse patch enabling undo without hand-written inverse operations. */
  undo?: Record<string, unknown>
}

/** Plugins return intents. The engine applies them and logs them. */
export type Intent =
  | { type: 'setPhase'; phase: Phase }
  | { type: 'awardPoints'; teamId: string; delta: number; reason: string }
  | { type: 'consumeQuestion'; questionId: string }
  | { type: 'selectQuestion'; questionId: string }
  | { type: 'setTurn'; teamId: string | null }
  | { type: 'lockout'; teamId: string }
  | { type: 'startClock'; ms: number }
  | { type: 'stopClock' }
  | { type: 'playSound'; key: string }
  | { type: 'effect'; key: string; options?: Record<string, unknown> }
  | { type: 'eliminate'; teamId: string }
  | { type: 'custom'; key: string; payload: Record<string, unknown> }

// ---------------------------------------------------------------------------
// 1. STYLE — owns the board, question selection, and what "a turn" means
// ---------------------------------------------------------------------------

export interface StylePlugin<O = Record<string, unknown>> {
  key: RegistryKey
  /** Build the board model this style renders from a round's content. */
  buildBoard(round: Round, options: O): BoardModel
  /** Which questions may be picked right now. */
  availableQuestions(state: SessionState, board: BoardModel): string[]
  /** Called when the host/turn-owner picks. Returns intents. */
  onSelect(state: SessionState, questionId: string): Intent[]
  /** Called after adjudication — lets the style advance its own board state. */
  onResolved(state: SessionState, correct: boolean): Intent[]
  /** Style-specific win condition (tic-tac-toe line, hangman solved, ...). */
  isRoundComplete(state: SessionState, board: BoardModel): boolean
  /** Component key the stage view renders. */
  stageComponent: string
  hostComponent: string
}

export interface BoardModel {
  kind: string
  /** Generic cell list — styles interpret `meta` however they like. */
  cells: Array<{
    id: string
    questionId: string
    label: string
    row?: number
    col?: number
    consumed: boolean
    special?: string | null
    meta?: Record<string, unknown>
  }>
  meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// 2. SCORING — pure function from outcome to point deltas
// ---------------------------------------------------------------------------

export interface ScoringPlugin {
  key: RegistryKey
  /**
   * MUST be pure. Given the outcome, return deltas. Purity is what makes undo,
   * replay, and score auditing work — never mutate state in here.
   */
  score(input: ScoreInput): ScoreDelta[]
}

export interface ScoreInput {
  state: SessionState
  rules: RuleSet
  question: Question
  teamId: string
  correct: boolean
  /** ms from arming to answer submission. */
  elapsedMs: number
  isSteal: boolean
  wager?: number
}

export interface ScoreDelta {
  teamId: string
  delta: number
  /** Shown in the host's score log — makes disputes resolvable. */
  reason: string
}

// ---------------------------------------------------------------------------
// 3. INPUT — where buzzes and answers come from
// ---------------------------------------------------------------------------

export interface InputPlugin<O = Record<string, unknown>> {
  key: RegistryKey
  /** Begin listening. Call `emit` on every input event. */
  attach(emit: (e: InputEvent) => void, options: O): () => void
}

export type InputEvent =
  | { kind: 'buzz'; playerId?: string; teamId?: string; receivedAt: number }
  | { kind: 'answer'; playerId: string; value: string | number; receivedAt: number }
  | { kind: 'lifeline'; teamId: string; lifeline: string }

// ---------------------------------------------------------------------------
// 4. TRANSPORT — how state reaches clients
// ---------------------------------------------------------------------------

export interface TransportPlugin<O = Record<string, unknown>> {
  key: RegistryKey
  start(options: O): Promise<TransportHandle>
}

export interface TransportHandle {
  /** Push authoritative state. Redaction (hiding answers) happens above this. */
  broadcast(channel: 'stage' | 'host' | 'player', payload: unknown): void
  onCommand(handler: (cmd: { from: string; type: string; payload: unknown }) => void): void
  /** Latency sample per client, for compensated buzz arbitration. */
  rtt(clientId: string): number
  stop(): Promise<void>
}

// ---------------------------------------------------------------------------
// 5. LIFELINE / SPECIAL TILE / EFFECT / WIDGET / LAYOUT / TRANSITION
// ---------------------------------------------------------------------------

export interface LifelinePlugin<O = Record<string, unknown>> {
  key: RegistryKey
  label: string
  icon?: string
  /** May this be used right now? */
  isAvailable(state: SessionState, teamId: string): boolean
  apply(state: SessionState, teamId: string, options: O): Intent[]
}

export interface SpecialTilePlugin<O = Record<string, unknown>> {
  key: RegistryKey
  /** Fired when a tile carrying this marker is selected. */
  onSelected(state: SessionState, question: Question, options: O): Intent[]
  /** Modify scoring for this question (e.g. double value, wager). */
  modifyScore?(deltas: ScoreDelta[], input: ScoreInput, options: O): ScoreDelta[]
}

export interface EffectPlugin<O = Record<string, unknown>> {
  key: RegistryKey
  /** Visual/audio flourish. Runs client-side only; never affects state. */
  play(target: HTMLElement, options: O): Promise<void>
}

export interface HandlerPlugin<O = Record<string, unknown>> {
  key: RegistryKey
  handle(event: GameEvent, state: SessionState, options: O): void | Promise<void>
}

// ---------------------------------------------------------------------------
// Registry implementation
// ---------------------------------------------------------------------------

export type RegistryKind =
  | 'style' | 'scoring' | 'input' | 'transport' | 'lifeline'
  | 'specialTile' | 'effect' | 'handler' | 'layout' | 'transition'
  | 'widget' | 'timer' | 'questionKind' | 'persistence'

type AnyPlugin = { key: RegistryKey }

const registries = new Map<RegistryKind, Map<RegistryKey, AnyPlugin>>()

export function register<T extends AnyPlugin>(kind: RegistryKind, plugin: T): void {
  if (!registries.has(kind)) registries.set(kind, new Map())
  const r = registries.get(kind)!
  if (r.has(plugin.key)) {
    throw new Error(`[registry] duplicate ${kind} plugin: "${plugin.key}"`)
  }
  r.set(plugin.key, plugin)
}

export function resolve<T extends AnyPlugin>(kind: RegistryKind, key: RegistryKey): T {
  const plugin = registries.get(kind)?.get(key)
  if (!plugin) {
    const known = list(kind).join(', ') || '(none registered)'
    throw new Error(
      `[registry] unknown ${kind} plugin "${key}". Registered: ${known}`
    )
  }
  return plugin as T
}

export function list(kind: RegistryKind): RegistryKey[] {
  return [...(registries.get(kind)?.keys() ?? [])]
}

/** Validate every plugin key referenced by a config before the show starts. */
export function validateConfigPlugins(config: GameShowConfig): string[] {
  const errors: string[] = []
  const check = (kind: RegistryKind, key: RegistryKey | null | undefined, where: string) => {
    if (!key) return
    if (!registries.get(kind)?.has(key)) {
      errors.push(`${where}: unknown ${kind} plugin "${key}"`)
    }
  }

  check('transport', config.runtime.transport.driver, 'runtime.transport.driver')
  check('scoring', config.rules.scoring.engine, 'rules.scoring.engine')
  check('layout', config.layout.stageLayout, 'layout.stageLayout')

  config.program.rounds.forEach((round, i) => {
    if (round.style.kind === 'custom') {
      check('style', round.style.plugin, `program.rounds[${i}].style.plugin`)
    }
    const engine = round.overrides?.rules?.scoring?.engine
    if (engine) check('scoring', engine, `program.rounds[${i}].scoring.engine`)
  })

  config.rules.lifelines.available.forEach((l, i) =>
    check('lifeline', l.plugin, `rules.lifelines.available[${i}]`))

  config.integration.hooks.forEach((h, i) =>
    check('handler', h.plugin, `integration.hooks[${i}]`))

  config.layout.widgets.forEach((w, i) =>
    check('widget', w.plugin, `layout.widgets[${i}]`))

  return errors
}
