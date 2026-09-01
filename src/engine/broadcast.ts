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

  consumed: string[]
  teams: readonly TeamState[]
  players: readonly PlayerState[]
  buzzes: readonly BuzzRecord[]
  turnTeamId: string | null
  attemptsUsed: number
  lockedOutTeamIds: string[]
  clockStartedAt: number | null

  questionSec: number | null
  board: BoardModel

  availableQuestionIds: string[]
  theme: ThemeTokens
  copy: CopyStrings

  config: GameShowConfig

  log?: readonly GameEvent[]
}

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

function withPointValueLabels(board: BoardModel, pointLadder: number[]): BoardModel {
  return {
    ...board,
    cells: board.cells.map(cell => ({
      ...cell,
      label: String(pointLadder[cell.row ?? -1] ?? ''),
    })),
  }
}

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
