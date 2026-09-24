/** The handful of form controls the Studio panels are built from. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function button(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const node = el('button', className, label)
  node.type = 'button'
  node.addEventListener('click', onClick)
  return node
}

export function field(label: string, control: HTMLElement, note?: string): HTMLElement {
  const wrap = el('label', 'field')
  const caption = el('span', undefined, label)
  if (note !== undefined) {
    caption.append(' ')
    caption.append(el('span', 'note', note))
  }
  wrap.append(caption, control)
  return wrap
}

export function textInput(
  value: string,
  onChange: (value: string) => void,
  placeholder = '',
): HTMLInputElement {
  const node = el('input')
  node.type = 'text'
  node.value = value
  node.placeholder = placeholder
  node.addEventListener('input', () => { onChange(node.value) })
  return node
}

export function textArea(
  value: string,
  onChange: (value: string) => void,
  placeholder = '',
): HTMLTextAreaElement {
  const node = el('textarea')
  node.value = value
  node.placeholder = placeholder
  node.rows = 2
  node.addEventListener('input', () => { onChange(node.value) })
  return node
}

export function numberInput(
  value: number,
  onChange: (value: number) => void,
  options: { min?: number; max?: number; step?: number } = {},
): HTMLInputElement {
  const node = el('input')
  node.type = 'number'
  node.value = String(value)
  if (options.min !== undefined) node.min = String(options.min)
  if (options.max !== undefined) node.max = String(options.max)
  node.step = String(options.step ?? 1)
  node.addEventListener('input', () => {
    const parsed = Number(node.value)
    if (Number.isFinite(parsed)) onChange(parsed)
  })
  return node
}

export function colorInput(value: string, onChange: (value: string) => void): HTMLInputElement {
  const node = el('input')
  node.type = 'color'
  // A color input only accepts #rrggbb; a theme may carry rgba() or a name.
  node.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'
  node.addEventListener('input', () => { onChange(node.value) })
  return node
}

export function checkbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const wrap = el('label', 'check')
  const node = el('input')
  node.type = 'checkbox'
  node.checked = checked
  node.addEventListener('change', () => { onChange(node.checked) })
  wrap.append(node, el('span', undefined, label))
  return wrap
}

export function select(
  options: ReadonlyArray<{ label: string; value: string }>,
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const node = el('select')
  for (const option of options) {
    const item = el('option', undefined, option.label)
    item.value = option.value
    node.append(item)
  }
  node.value = value
  node.addEventListener('change', () => { onChange(node.value) })
  return node
}

/** Two or three mutually exclusive choices, shown as one control. */
export function segmented(
  options: ReadonlyArray<{ label: string; value: string }>,
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const wrap = el('div', 'seg')
  for (const option of options) {
    const node = button(option.label, '', () => { onChange(option.value) })
    node.setAttribute('aria-pressed', String(option.value === value))
    wrap.append(node)
  }
  return wrap
}

export function block(title: string, help?: string): HTMLElement {
  const node = el('section', 'block')
  node.append(el('h3', undefined, title))
  if (help !== undefined) node.append(el('p', 'help', help))
  return node
}

export function fields(...children: HTMLElement[]): HTMLElement {
  const wrap = el('div', 'fields')
  wrap.append(...children)
  return wrap
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = el('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
