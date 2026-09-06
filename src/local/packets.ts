import { playPacket, showLabel } from './host'
import { formatProblems, hasErrors, isPacketPath, type PacketProblem } from '../config/packet'

/**
 * Loading questions on the laptop that is running the show. The engine lives in
 * this window, so a packet is read, validated and played entirely client-side —
 * no server, no upload, no rebuild.
 */

const STORAGE_KEY = 'triviamaker.packets'
const MAX_REMEMBERED = 8
const MAX_STATUS_LINES = 4

interface StoredPacket {
  name: string
  text: string
}

/** localStorage throws outright in some privacy modes, so every access is guarded. */
function readLibrary(): StoredPacket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is StoredPacket =>
      typeof entry === 'object' && entry !== null
      && typeof (entry as StoredPacket).name === 'string'
      && typeof (entry as StoredPacket).text === 'string')
  } catch {
    return []
  }
}

function writeLibrary(packets: readonly StoredPacket[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(packets.slice(0, MAX_REMEMBERED)))
  } catch {
    // Out of quota or storage denied — the packet still plays, it just is not remembered.
  }
}

function remember(packet: StoredPacket): StoredPacket[] {
  const rest = readLibrary().filter(entry => entry.name !== packet.name)
  const next = [packet, ...rest].slice(0, MAX_REMEMBERED)
  writeLibrary(next)
  return next
}

export function mountPacketPicker(): void {
  const chooser = document.getElementById('packet-choose')
  const file = document.getElementById('packet-file')
  const picker = document.getElementById('packet-pick')
  const status = document.getElementById('packet-status')
  const title = document.getElementById('show-title')

  if (!(chooser instanceof HTMLButtonElement) || !(file instanceof HTMLInputElement)
    || !(picker instanceof HTMLSelectElement) || !status) return

  const say = (message: string, bad: boolean): void => {
    status.textContent = message
    status.classList.toggle('bad', bad)
  }

  // formatProblems indents for a terminal; on a toolbar the lines run together.
  const lines = (problems: readonly PacketProblem[]): string[] =>
    formatProblems(problems).map(line => line.trim()).slice(0, MAX_STATUS_LINES)

  const refreshPicker = (library: readonly StoredPacket[], selected: string): void => {
    picker.replaceChildren()
    const builtIn = document.createElement('option')
    builtIn.value = ''
    builtIn.textContent = 'Built-in show'
    picker.append(builtIn)

    for (const entry of library) {
      const option = document.createElement('option')
      option.value = entry.name
      option.textContent = entry.name
      picker.append(option)
    }
    picker.value = selected
    picker.hidden = library.length === 0
  }

  const load = (name: string, text: string, keep: boolean): void => {
    const problems = playPacket(text, name)

    if (hasErrors(problems)) {
      say(lines(problems).join(' · '), true)
      return
    }

    if (title) title.textContent = showLabel()
    refreshPicker(keep ? remember({ name, text }) : readLibrary(), name)

    const notes = lines(problems)
    say(notes.length > 0 ? `Playing ${name} — ${notes.join(' · ')}` : `Playing ${name}`, false)
  }

  const readFile = (dropped: File): void => {
    if (!isPacketPath(dropped.name)) {
      say(`${dropped.name} is not a packet — expected a .json or .csv file`, true)
      return
    }
    dropped.text()
      .then(text => { load(dropped.name, text, true) })
      .catch((error: unknown) => {
        say(error instanceof Error ? error.message : String(error), true)
      })
  }

  chooser.addEventListener('click', () => { file.click() })

  file.addEventListener('change', () => {
    const chosen = file.files?.[0]
    if (chosen) readFile(chosen)
    file.value = '' // so the same file can be picked twice after an edit
  })

  picker.addEventListener('change', () => {
    if (picker.value === '') {
      // Rebuilding the authored show means rebuilding from the preset, which the
      // page already does on load.
      location.reload()
      return
    }
    const entry = readLibrary().find(candidate => candidate.name === picker.value)
    if (entry) load(entry.name, entry.text, false)
  })

  document.addEventListener('dragover', event => { event.preventDefault() })
  document.addEventListener('drop', event => {
    const dropped = event.dataTransfer?.files?.[0]
    if (!dropped) return
    event.preventDefault()
    readFile(dropped)
  })

  refreshPicker(readLibrary(), '')
}
