import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { randomDice, seededDice } from './dice'
import './styles.css'
import { FAST_TIMING, NORMAL_TIMING } from './useGame'

// ?seed=N gives repeatable dice, and ?fast skips pauses and animation (used by the browser tests).
const params = new URLSearchParams(location.search)
const seed = params.get('seed')
const dice = seed ? seededDice(Number(seed)) : randomDice
const timing = params.has('fast') ? FAST_TIMING : NORMAL_TIMING

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App dice={dice} timing={timing} />
  </StrictMode>,
)
