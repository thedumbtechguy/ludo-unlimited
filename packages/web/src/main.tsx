import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { randomDice, scriptedDice, seededDice } from './dice'
import { audio } from './fx/audio'
import { listenForTaps } from './fx/sound'
import './styles.css'
import { FAST_TIMING, NORMAL_TIMING } from './useGame'
import { registerSW } from 'virtual:pwa-register'
import { updateReady } from './update'

// ?seed=N gives repeatable dice, and ?fast skips pauses and animation (used by the browser tests).
// In dev only, ?dice=6,6,6,3 rolls those values first (for checking effects by eye).
const params = new URLSearchParams(location.search)
const seed = params.get('seed')
const seeded = seed ? seededDice(Number(seed)) : randomDice
const scripted = import.meta.env.DEV ? params.get('dice') : null
const dice = scripted ? scriptedDice(scripted.split(',').map(Number), seeded) : seeded
const timing = params.has('fast') ? FAST_TIMING : NORMAL_TIMING
// The browser tests' ?fast plays silently: audio never starts.
if (timing !== FAST_TIMING) {
  audio.start()
  listenForTaps()
}

const reload = registerSW({
  immediate: true,
  onNeedRefresh: () => updateReady(() => void reload(true)),
  onRegisteredSW(_url, registration) {
    // An installed app can sit in the background for days: look for a new version whenever it comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration?.update()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App dice={dice} timing={timing} />
  </StrictMode>,
)
