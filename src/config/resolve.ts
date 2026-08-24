/**
 * ============================================================================
 * CONFIG RESOLUTION — the layered cascade
 * ============================================================================
 *
 *   defaults  ->  preset (extends)  ->  event config  ->  round override
 *                                                      ->  question override
 *                                                      ->  live host override
 *
 * Later layers deep-merge over earlier ones. This is the single mechanism that
 * makes "customise anything" tractable: an author specifies only deltas, and
 * the engine always reads a fully-resolved object. No `??` chains anywhere in
 * the engine, no undefined checks, no "which layer did this come from" bugs.
 */

import type {
  GameShowConfig, GameShowConfigInput, DeepPartial, Round, RuleSet, Question,
} from './types'
import { DEFAULT_CONFIG } from './defaults'

/** Arrays REPLACE rather than concatenate — merging arrays of questions or
 *  teams positionally is never what an author means. */
export function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (patch === undefined || patch === null) return base
  if (Array.isArray(patch)) return patch as unknown as T
  if (typeof patch !== 'object' || typeof base !== 'object' || base === null) {
    return patch as T
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue
    const b = (base as Record<string, unknown>)[k]
    out[k] =
      v !== null && typeof v === 'object' && !Array.isArray(v) &&
      b !== null && typeof b === 'object' && !Array.isArray(b)
        ? deepMerge(b, v as DeepPartial<unknown>)
        : v
  }
  return out as T
}

export type PresetLookup = (id: string) => GameShowConfigInput | undefined

/**
 * Resolve an authored config into a complete one.
 * Follows `extends` chains, guarding against cycles.
 */
export function resolveConfig(
  input: GameShowConfigInput,
  lookupPreset: PresetLookup = () => undefined,
): GameShowConfig {
  const chain: GameShowConfigInput[] = []
  const seen = new Set<string>()

  let cursor: GameShowConfigInput | undefined = input
  while (cursor) {
    chain.unshift(cursor)
    const parentId: string | undefined = cursor.extends
    if (!parentId) break
    if (seen.has(parentId)) {
      throw new Error(`[config] circular extends chain at "${parentId}"`)
    }
    seen.add(parentId)
    cursor = lookupPreset(parentId)
    if (!cursor) throw new Error(`[config] preset not found: "${parentId}"`)
  }

  return chain.reduce<GameShowConfig>(
    (acc, layer) => deepMerge(acc, layer as DeepPartial<GameShowConfig>),
    DEFAULT_CONFIG,
  )
}

/** Rules in effect for a round — event rules + that round's overrides. */
export function rulesForRound(config: GameShowConfig, round: Round): RuleSet {
  return deepMerge(config.rules, round.overrides?.rules)
}

/** Rules in effect for a single question — the deepest layer. */
export function rulesForQuestion(
  config: GameShowConfig,
  round: Round,
  question: Question,
): RuleSet {
  return deepMerge(rulesForRound(config, round), question.overrides)
}

/**
 * Everything visual for a round, resolved. The stage view calls this once per
 * round and emits the result as CSS custom properties.
 */
export function presentationForRound(config: GameShowConfig, round: Round) {
  return {
    theme: deepMerge(config.theme, round.overrides?.theme),
    motion: deepMerge(config.motion, round.overrides?.motion),
    sound: deepMerge(config.sound, round.overrides?.sound),
    copy: deepMerge(config.copy, round.overrides?.copy),
  }
}

/** Flatten theme tokens into CSS custom properties for the document root. */
export function themeToCssVars(theme: GameShowConfig['theme']): Record<string, string> {
  const vars: Record<string, string> = {}
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const name = `${prefix}-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, name)
      } else if (typeof v === 'string' || typeof v === 'number') {
        vars[name] = String(v)
      }
    }
  }
  walk(theme.color as unknown as Record<string, unknown>, '--color')
  walk(theme.type as unknown as Record<string, unknown>, '--type')
  walk(theme.space as unknown as Record<string, unknown>, '--space')
  walk(theme.radius as unknown as Record<string, unknown>, '--radius')
  walk(theme.shadow as unknown as Record<string, unknown>, '--shadow')
  Object.assign(vars, theme.custom ?? {})
  return vars
}

/**
 * Redact host-only fields before sending content to stage or player clients.
 * Call this at the transport boundary — never rely on the client to not render
 * a field it was given. The answer key must not exist in the projector bundle.
 */
export function redactQuestion(
  q: Question,
  audience: 'stage' | 'player' | 'host',
): Partial<Question> {
  if (audience === 'host') return q
  const { answer, acceptedAnswers, hostNote, correctChoiceIndex, numericAnswer, ...safe } = q
  return safe
}
