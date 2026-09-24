import '../registry/plugins'
// The Studio show runs in the browser over the BroadcastChannel transport, so the
// checks have to resolve the same plugin the local host will.
import '../local/channel'
import { formatProblems, readPacketText } from '../config/packet'
import { draftToConfig, importBankIntoRound, upgradeDraft, type Draft } from './draft'
import {
  bind, currentRound, freshDraft, refresh, rerender, replaceDraft, state, type Tab,
} from './store'
import { showPanel } from './panels/show'
import { roundsPanel } from './panels/rounds'
import { questionsPanel } from './panels/questions'
import { teamsPanel } from './panels/teams'
import { lookPanel } from './panels/look'
import { motionPanel } from './panels/motion'
import { wordsPanel } from './panels/words'
import { renderPreview } from './preview'
import { questionCount, renderChecks } from './checks'
import { button, download, el } from './ui'

/**
 * The Studio shell: tabs, the two columns, and the four buttons in the bar.
 * Everything with an opinion about the show lives in panels/ — this file only
 * decides what is on screen and what leaves the page.
 */

const panel = document.getElementById('panel')
const preview = document.getElementById('preview')
const checks = document.getElementById('checks')
const tabsBar = document.getElementById('tabs')
const savedNote = document.getElementById('saved')
if (!panel || !preview || !checks || !tabsBar) throw new Error('[studio] page markup is incomplete')

function tabs(): Array<{ id: Tab; label: string }> {
  return [
    { id: 'show', label: 'Show' },
    { id: 'rounds', label: `Rounds · ${state.draft.rounds.length}` },
    { id: 'questions', label: `Questions · ${questionCount()}` },
    { id: 'teams', label: `Teams · ${state.draft.teams.length}` },
    { id: 'look', label: 'Look' },
    { id: 'motion', label: 'Motion' },
    { id: 'words', label: 'Words' },
  ]
}

function panelFor(tab: Tab): HTMLElement[] {
  switch (tab) {
    case 'show': return showPanel()
    case 'rounds': return roundsPanel()
    case 'questions': return questionsPanel(pickFile, exportRound)
    case 'teams': return teamsPanel()
    case 'look': return lookPanel()
    case 'motion': return motionPanel()
    case 'words': return wordsPanel()
  }
}

function paint(): void {
  renderPreview(preview!)
  const startable = renderChecks(checks!)
  const start = document.getElementById('start')
  if (start instanceof HTMLButtonElement) start.disabled = !startable
  if (savedNote && savedNote.dataset['sticky'] !== 'true') {
    savedNote.textContent = 'Saved on this computer'
    savedNote.style.color = 'var(--muted)'
  }
  if (savedNote) savedNote.dataset['sticky'] = 'false'
}

function rebuild(): void {
  const next = document.createDocumentFragment()
  for (const entry of tabs()) {
    const node = button(entry.label, '', () => {
      state.tab = entry.id
      rerender()
    })
    node.setAttribute('aria-current', String(state.tab === entry.id))
    next.append(node)
  }
  tabsBar!.replaceChildren(next)

  panel!.replaceChildren(...panelFor(state.tab))
  paint()
}

bind(paint, rebuild)

// ------------------------------------------------------------------ messages

function say(message: string, bad: boolean): void {
  if (!savedNote) return
  savedNote.textContent = message
  savedNote.style.color = bad ? 'var(--wrong)' : 'var(--muted)'
  // Survive the repaint that follows the edit which produced this message.
  savedNote.dataset['sticky'] = 'true'
}

// ------------------------------------------------------------- files in, out

const fileInput = el('input')
fileInput.type = 'file'
fileInput.accept = '.json,.csv'
fileInput.hidden = true
document.body.append(fileInput)

function pickFile(): void {
  fileInput.click()
}

function fileSlug(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug === '' ? 'my-show' : slug
}

function isDraftFile(value: unknown): value is Partial<Draft> {
  if (typeof value !== 'object' || value === null) return false
  return 'rounds' in value || 'feud' in value || 'look' in value
}

function importText(name: string, text: string): void {
  if (name.endsWith('.json')) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (isDraftFile(parsed)) {
        replaceDraft(upgradeDraft(parsed))
        state.tab = 'questions'
        refresh()
        rerender()
        say(`Loaded ${name}`, false)
        return
      }
    } catch {
      // Not a studio file — fall through and try it as a question packet.
    }
  }

  const { bank, problems } = readPacketText(text, name)
  if (!bank) {
    say(formatProblems(problems).map(problem => problem.trim()).join(' · '), true)
    return
  }

  state.draft.rounds[state.round] = importBankIntoRound(currentRound(), bank)
  state.tab = 'questions'
  refresh()
  rerender()
  say(`Loaded ${name} into ${currentRound().name} — ${questionCount(state.round)} question(s)`, false)
}

function readFile(file: File): void {
  file.text()
    .then(text => { importText(file.name, text) })
    .catch((error: unknown) => { say(error instanceof Error ? error.message : String(error), true) })
}

function exportRound(): void {
  const round = currentRound()
  const banks = draftToConfig(state.draft).content?.banks ?? []
  const bank = banks.find(candidate => candidate?.id === round.id)
  download(
    `${fileSlug(state.draft.title)}-${fileSlug(round.name)}.json`,
    JSON.stringify(bank, null, 2),
    'application/json',
  )
}

fileInput.addEventListener('change', () => {
  const chosen = fileInput.files?.[0]
  if (chosen) readFile(chosen)
  fileInput.value = ''
})

document.addEventListener('dragover', event => { event.preventDefault() })
document.addEventListener('drop', event => {
  const dropped = event.dataTransfer?.files?.[0]
  if (!dropped) return
  event.preventDefault()
  readFile(dropped)
})

// ------------------------------------------------------------------- actions

document.getElementById('start')?.addEventListener('click', () => {
  refresh()
  location.href = '../local/index.html?show=studio&token=local'
})

document.getElementById('import')?.addEventListener('click', pickFile)

document.getElementById('export')?.addEventListener('click', () => {
  download(
    `${fileSlug(state.draft.title)}.json`,
    JSON.stringify(state.draft, null, 2),
    'application/json',
  )
})

document.getElementById('reset')?.addEventListener('click', () => {
  if (!confirm('Throw away this show and start again from the shipped questions?')) return
  replaceDraft(freshDraft())
  state.tab = 'show'
  refresh()
  rerender()
})

rebuild()
