import { publish, showTitle, roundCount } from './host'

const projector = document.getElementById('open-projector')
if (projector) {
  projector.addEventListener('click', () => {
    window.open('./stage.html', 'triviamaker-stage', 'width=1280,height=720')
  })
}

const title = document.getElementById('show-title')
if (title) title.textContent = `${showTitle} · ${roundCount} round(s)`

await import('../host/main')

publish()
