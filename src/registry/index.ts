import type {
  GameShowConfig, RuleSet, Question, Round, GameEventName, RegistryKey,
} from '../config/types'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue }

export type Phase =
  | 'lobby' | 'roundIntro' | 'board' | 'reading' | 'armed'
  | 'reveal' | 'intermission' | 'final'

export interface SessionState {
  readonly id: string
  readonly config: GameShowConfig
  readonly phase: Phase
  readonly roundIndex: number
  readonly currentQuestionId: string | null
  readonly consumed: ReadonlySet<string>
  readonly teams: readonly TeamState[]
  readonly clockStartedAt: number | null

  /** Owned by the round's style plugin — the engine only carries it. */
  readonly styleState: Record<string, JsonValue>
  readonly log: readonly GameEvent[]
}

export interface TeamState {
  id: string; name: string; color: string; score: number
  eliminated: boolean
}

export interface GameEvent {
  seq: number
  at: number
  name: GameEventName
  payload: Record<string, unknown>

  undo?: Record<string, unknown>
}

export type Intent =
  | { type: 'setPhase'; phase: Phase }
  | { type: 'awardPoints'; teamId: string; delta: number; reason: string }
  | { type: 'consumeQuestion'; questionId: string }
  | { type: 'selectQuestion'; questionId: string }
  | { type: 'startClock'; ms: number }
  | { type: 'stopClock' }
  | { type: 'eliminate'; teamId: string }
  | { type: 'setStyleState'; nextStyleState: Record<string, JsonValue> }
  | { type: 'advanceRound' }

export interface StylePlugin<O = Record<string, unknown>> {
  key: RegistryKey

  buildBoard(round: Round, options: O, state: SessionState): BoardModel

  availableQuestions(state: SessionState, board: BoardModel): string[]

  onSelect(state: SessionState, questionId: string): Intent[]

  onResolved(state: SessionState, correct: boolean): Intent[]

  isRoundComplete(state: SessionState, board: BoardModel): boolean

  /**
   * Commands the engine does not recognise are offered to the round's style
   * before being rejected. Return null to decline — a board format that invents
   * its own verbs does it here rather than growing a case in engine/commands.ts.
   */
  onCommand?(state: SessionState, type: string, fields: Record<string, unknown>): Intent[] | null

  stageComponent: string
  hostComponent: string
}

export interface BoardModel {
  kind: string

  cells: Array<{
    id: string
    questionId: string
    label: string
    row?: number
    col?: number
    consumed: boolean
    meta?: Record<string, unknown>
  }>
  meta?: Record<string, unknown>
}

export interface ScoringPlugin {
  key: RegistryKey

  score(input: ScoreInput): ScoreDelta[]
}

export interface ScoreInput {
  state: SessionState
  rules: RuleSet
  question: Question
  teamId: string
  correct: boolean
}

export interface ScoreDelta {
  teamId: string
  delta: number

  reason: string
}

export interface TransportPlugin<O = Record<string, unknown>> {
  key: RegistryKey
  start(options: O): Promise<TransportHandle>
}

export interface TransportHandle {
  broadcast(channel: 'stage' | 'host', payload: unknown): void
  onCommand(handler: (cmd: { from: string; type: string; payload: unknown }) => void): void
  stop(): Promise<void>
}

export type RegistryKind = 'style' | 'scoring' | 'transport' | 'layout'

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

/** Names every plugin key a config asks for that nothing has registered. */
export function validateConfigPlugins(config: GameShowConfig): string[] {
  const errors: string[] = []
  const check = (kind: RegistryKind, key: RegistryKey | null | undefined, where: string) => {
    if (!key) return
    if (registries.get(kind)?.has(key)) return
    const known = list(kind).join(', ') || '(none registered)'
    errors.push(`${where}: unknown ${kind} plugin "${key}". Registered: ${known}`)
  }

  check('transport', config.runtime.transport.driver, 'runtime.transport.driver')
  check('scoring', config.rules.scoring.engine, 'rules.scoring.engine')
  check('layout', config.layout.stageLayout, 'layout.stageLayout')

  config.program.rounds.forEach((round, i) => {
    round.style.kind === 'custom'
      ? check('style', round.style.plugin, `program.rounds[${i}].style.plugin`)
      : check('style', round.style.kind, `program.rounds[${i}].style.kind`)

    const engine = round.overrides?.rules?.scoring?.engine
    if (engine) check('scoring', engine, `program.rounds[${i}].scoring.engine`)
  })

  return errors
}
