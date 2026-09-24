import { defaultLook, FONT_CHOICES, PALETTES, SHADOWS, type DraftLook, type ShadowKey } from '../draft'
import { block, button, checkbox, colorInput, el, field, fields, numberInput, select } from '../ui'
import { refresh, rerender, state } from '../store'

type ColorKey = 'bg' | 'bgElevated' | 'text' | 'textMuted' | 'accent' | 'correct' | 'wrong'
  | 'tile' | 'tileConsumed' | 'tileText'

const COLOR_FIELDS: Array<{ label: string; key: ColorKey; note?: string }> = [
  { label: 'Background', key: 'bg' },
  { label: 'Panels', key: 'bgElevated', note: '(cards, slots)' },
  { label: 'Text', key: 'text' },
  { label: 'Quiet text', key: 'textMuted' },
  { label: 'Accent', key: 'accent', note: '(points, highlights)' },
  { label: 'Right answer', key: 'correct' },
  { label: 'Wrong answer', key: 'wrong', note: '(strikes)' },
  { label: 'Tiles', key: 'tile' },
  { label: 'Played tiles', key: 'tileConsumed' },
  { label: 'Tile numbers', key: 'tileText' },
]

type ScaleKey = 'scaleTile' | 'scaleQuestion' | 'scaleCategory' | 'scaleScore'

const SCALE_FIELDS: Array<{ label: string; key: ScaleKey }> = [
  { label: 'Question', key: 'scaleQuestion' },
  { label: 'Tile value', key: 'scaleTile' },
  { label: 'Category', key: 'scaleCategory' },
  { label: 'Score', key: 'scaleScore' },
]

export function lookPanel(): HTMLElement[] {
  const look = state.draft.look

  const palette = block('Palette', 'Start from one of these, then change anything below.')
  const swatches = el('div', 'palettes')
  for (const option of PALETTES) {
    const node = button('', 'swatch', () => {
      state.draft.look = { ...look, ...option.look }
      rerender()
    })
    const chips = el('div', 'chips')
    for (const color of [option.look.bg, option.look.tile, option.look.accent, option.look.text]) {
      const chip = el('i')
      chip.style.background = color ?? '#000'
      chips.append(chip)
    }
    node.append(chips, el('span', undefined, option.name))
    swatches.append(node)
  }
  palette.append(swatches)

  const colors = block('Colours', 'What the projector paints with.')
  colors.append(fields(...COLOR_FIELDS.map(entry => {
    return field(entry.label, colorInput(look[entry.key], value => {
      look[entry.key] = value
      refresh()
    }), entry.note)
  })))
  colors.append(fields(
    field('Dim behind a question', numberInput(look.scrimOpacity, value => {
      look.scrimOpacity = Math.min(100, Math.max(0, Math.round(value)))
      refresh()
    }, { min: 0, max: 100, step: 4 }), '(% of the background colour)'),
  ))

  const type = block('Type', 'Every size on the projector is a multiple of the base size.')
  type.append(fields(
    field('Headline font', select(FONT_CHOICES, look.display, value => {
      look.display = value
      refresh()
    })),
    field('Body font', select(FONT_CHOICES, look.body, value => {
      look.body = value
      refresh()
    })),
    field('Base size', numberInput(look.baseSize, value => {
      look.baseSize = Math.min(48, Math.max(10, Math.round(value)))
      refresh()
    }, { min: 10, max: 48 }), '(px)'),
    field('Categories', checkbox('UPPERCASE', look.uppercaseCategories, value => {
      look.uppercaseCategories = value
      refresh()
    })),
  ))
  type.append(fields(...SCALE_FIELDS.map(entry => {
    return field(entry.label, numberInput(look[entry.key], value => {
      look[entry.key] = Math.min(12, Math.max(0.5, value))
      refresh()
    }, { min: 0.5, max: 12, step: 0.1 }), `(× ${look.baseSize}px)`)
  })))

  const layout = block('Spacing and shape', 'How tight the board is, and how round its corners are.')
  layout.append(fields(
    field('Gap between tiles', numberInput(look.boardGap, value => {
      look.boardGap = Math.max(0, Math.round(value))
      refresh()
    }, { min: 0, max: 64 }), '(px)'),
    field('Screen padding', numberInput(look.screenPadding, value => {
      look.screenPadding = Math.max(0, Math.round(value))
      refresh()
    }, { min: 0, max: 160, step: 4 }), '(px)'),
    field('Tile corners', numberInput(look.radiusTile, value => {
      look.radiusTile = Math.max(0, Math.round(value))
      refresh()
    }, { min: 0, max: 48 }), '(px)'),
    field('Card corners', numberInput(look.radiusCard, value => {
      look.radiusCard = Math.max(0, Math.round(value))
      refresh()
    }, { min: 0, max: 64 }), '(px)'),
    field('Pill corners', numberInput(look.radiusPill, value => {
      look.radiusPill = Math.max(0, Math.round(value))
      refresh()
    }, { min: 0, max: 999 }), '(px)'),
    field('Tile shadow', select(
      Object.keys(SHADOWS).map(key => ({ label: shadowLabel(key as ShadowKey), value: key })),
      look.shadow,
      value => {
        look.shadow = value as ShadowKey
        refresh()
      },
    )),
  ))

  const reset = el('div', 'row')
  reset.append(button('Back to the defaults', 'ghost add', () => {
    const fresh: DraftLook = defaultLook()
    state.draft.look = fresh
    rerender()
  }))
  layout.append(reset)

  return [palette, colors, type, layout]
}

function shadowLabel(key: ShadowKey): string {
  switch (key) {
    case 'none': return 'None — flat'
    case 'soft': return 'Soft — floating'
    case 'hard': return 'Hard — game-show block'
    case 'glow': return 'Glow — lit from behind'
  }
}
