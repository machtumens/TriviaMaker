import { marked } from 'marked'
import guide from '../../README.md?raw'

/**
 * README.md is the only copy of the guide: the repository front page and this page
 * are the same file, rendered at build time, so the two can never drift apart.
 */
const article = document.getElementById('guide')
if (article) article.innerHTML = marked.parse(guide, { async: false })

/** Wide tables scroll inside their own box rather than widening the page. */
for (const table of document.querySelectorAll('#guide table')) {
  const wrap = document.createElement('div')
  wrap.className = 'table-wrap'
  table.replaceWith(wrap)
  wrap.append(table)
}

/** Anchors, so a section can be linked to from chat on the day. */
for (const heading of document.querySelectorAll<HTMLHeadingElement>('#guide h2')) {
  heading.id = (heading.textContent ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
