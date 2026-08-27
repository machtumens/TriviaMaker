/**
 * BROADCAST — the single redaction call site (Design Locks L9 and L17).
 *
 * `broadcastState` is the ONLY function in the codebase that calls
 * `handle.broadcast(...)`. That is the whole point: redaction can only be
 * forgotten at a call site that exists, so there is exactly one to audit.
 *
 * Three things leave through here, and each is redacted differently:
 *
 *   1. the CURRENT question — `redactQuestion` strips answer/acceptedAnswers/
 *      hostNote/correctChoiceIndex/numericAnswer for stage and player.
 *   2. the CONTENT SNAPSHOT (`state.config.content`) — stripped entirely for
 *      stage and player. It holds every answer in the show; shipping it to the
 *      projector would defeat (1) completely.
 *   3. the BOARD — rebuilt fresh on every call and, for stage and player,
 *      relabelled with point values. `redactQuestion` never strips `prompt`
 *      (by design — the audience must read the question once it is selected),
 *      so an unredacted board would show every unplayed tile's question text.
 *
 * The board is deliberately NOT cached and `SessionState` has no `board` field:
 * `buildBoard` is a pure `columns * rows` construction, so recomputing it beats
 * every cache-invalidation bug a stored board would invite.
 */

import {
  resolve,
  type BoardModel, type BuzzRecord, type GameEvent, type PlayerState,
  type SessionState, type StylePlugin, type TeamState, type TransportHandle,
} from '../registry/index'
import type {
  CopyStrings, GameShowConfig, Question, ThemeTokens,
} from '../config/types'
import { presentationForRound, redactQuestion } from '../config/resolve'
import { findQuestion, resolvedQuestionSec } from './intents'
import { currentRound, resolveRoundContent, styleKeyFor } from './session'

type Audience = 'stage' | 'host' | 'player'

/** What a connected client actually receives. JSON-safe by construction. */
export interface BroadcastPayload {
  id: string
  joinCode: string
  phase: SessionState['phase']
  roundIndex: number
  round: {
    id: string
    title: string
    subtitle: string | null
    styleKind: string
    stageComponent: string
    hostComponent: string
    isComplete: boolean
  }
  currentQuestionId: string | null
  currentQuestion: Partial<Question> | null
  /** `state.consumed` as an array — a Set JSON-serialises to `{}`. */
  consumed: string[]
  teams: readonly TeamState[]
  players: readonly PlayerState[]
  buzzes: readonly BuzzRecord[]
  turnTeamId: string | null
  attemptsUsed: number
  lockedOutTeamIds: string[]
  clockStartedAt: number | null
  /** Resolved countdown length, so the client never re-walks the cascade. */
  questionSec: number | null
  board: BoardModel
  /**
   * Which questions may be picked right now, per the STYLE plugin.
   * Computed server-side so a style whose availability rule is richer than
   * "not yet consumed" still works without shipping the plugin to a client.
   */
  availableQuestionIds: string[]
  theme: ThemeTokens
  copy: CopyStrings
  /** Content banks are stripped for stage and player. */
  config: GameShowConfig
  /** Host only — the audit trail behind the undo button. */
  log?: readonly GameEvent[]
}

/** Strip every authored question (and therefore every answer) from a config. */
function withoutContent(config: GameShowConfig): GameShowConfig {
  return { ...config, content: { banks: [] } }
}

function withDerivedConsumption(board: BoardModel, state: SessionState): BoardModel {
  return {
    ...board,
    cells: board.cells.map(cell => ({
      ...cell,
      consumed: state.consumed.has(cell.questionId),
    })),
  }
}

/**
 * Replace every cell label with its point value.
 *
 * Applied regardless of `consumed`: a played tile's prompt is no more the
 * audience's business than an unplayed one's, and a rule with an exception is
 * a rule someone will get wrong.
 */
function withPointValueLabels(board: BoardModel, pointLadder: number[]): BoardModel {
  return {
    ...board,
    cells: board.cells.map(cell => ({
      ...cell,
      label: String(pointLadder[cell.row ?? -1] ?? ''),
    })),
  }
}

/**
 * Push authoritative state to every channel.
 *
 * A channel with no connected clients is a safe no-op inside the transport, so
 * this always writes to all three rather than tracking who is listening.
 */
export function broadcastState(
  handle: TransportHandle,
  state: SessionState,
  config: GameShowConfig,
): void {
  const round = currentRound(config, state.roundIndex)
  const style = resolve<StylePlugin>('style', styleKeyFor(round))
  const categories = resolveRoundContent(config, round)

  const built = style.buildBoard(round, { ...round.style, categories }, state)
  const hostBoard = withDerivedConsumption(built, state)
  // The ladder is read back off the BOARD, not off `round.style`: a board is the
  // only thing every style produces, so this needs no per-style cast. Runtime-
  // checked because `BoardModel.meta` is `Record<string, unknown>` by design.
  // Still grid-shaped (see `withPointValueLabels`) — generalising audience
  // relabelling across styles is a later concern, not this one.
  const rawPointLadder = hostBoard.meta?.['pointLadder']
  const pointLadder = Array.isArray(rawPointLadder) ? (rawPointLadder as number[]) : []
  const audienceBoard = withPointValueLabels(hostBoard, pointLadder)

  const presentation = presentationForRound(config, round)
  const question = state.currentQuestionId
    ? findQuestion(config, state.currentQuestionId)
    : null

  const base = {
    id: state.id,
    joinCode: state.joinCode,
    phase: state.phase,
    roundIndex: state.roundIndex,
    round: {
      id: round.id,
      title: round.title,
      subtitle: round.subtitle ?? null,
      styleKind: round.style.kind,
      stageComponent: style.stageComponent,
      hostComponent: style.hostComponent,
      isComplete: style.isRoundComplete(state, hostBoard),
    },
    availableQuestionIds: style.availableQuestions(state, hostBoard),
    currentQuestionId: state.currentQuestionId,
    consumed: [...state.consumed],
    teams: state.teams,
    players: state.players,
    buzzes: state.buzzes,
    turnTeamId: state.turnTeamId,
    attemptsUsed: state.attemptsUsed,
    lockedOutTeamIds: [...state.lockedOutTeamIds],
    clockStartedAt: state.clockStartedAt,
    questionSec: resolvedQuestionSec(config, state),
    theme: presentation.theme,
    copy: presentation.copy,
  }

  const forAudience = (audience: Exclude<Audience, 'host'>): BroadcastPayload => ({
    ...base,
    currentQuestion: question ? redactQuestion(question, audience) : null,
    board: audienceBoard,
    config: withoutContent(config),
  })

  const hostPayload: BroadcastPayload = {
    ...base,
    currentQuestion: question ? redactQuestion(question, 'host') : null,
    board: hostBoard,
    config,
    log: state.log,
  }

  handle.broadcast('host', hostPayload)
  handle.broadcast('stage', forAudience('stage'))
  handle.broadcast('player', forAudience('player'))
}
