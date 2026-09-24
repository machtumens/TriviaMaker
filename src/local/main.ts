import { publish, showLabel } from './host'
import { mountPacketPicker } from './packets'

const projector = document.getElementById('open-projector')
if (projector) {
  projector.addEventListener('click', () => {
    window.open('./stage.html', 'triviamaker-stage', 'width=1280,height=720')
  })
}

const title = document.getElementById('show-title')
if (title) title.textContent = showLabel()

mountPacketPicker()

await import('../host/main')

publish()
