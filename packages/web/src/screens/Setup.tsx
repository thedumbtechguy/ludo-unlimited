import { MODES, SEATS, settingsFor, type AfterKick, type EndCondition, type ModeName, type Rules, type Settings } from '@ludo/engine'
import { useState } from 'react'
import { COLOR_NAME } from '../labels'
import type { Seat, Seats } from '../types'

const MODE_NAME: Record<ModeName, string> = { classic: 'Classic', ghana: 'Ghana' }
const RULE_NAME: [keyof Rules, string][] = [
  ['backKick', 'Back Kick'],
  ['lineKick', 'Line Kick'],
  ['homeKick', 'Home Kick'],
  ['labourer', 'Labourer'],
]
const AFTER_KICK: [AfterKick, string][] = [
  ['normal', 'Nothing changes (a 6 still rolls again)'],
  ['endsTurn', 'A kick ends the turn'],
  ['bonusRoll', 'A kick earns another roll'],
]
const END: [EndCondition, string][] = [
  ['firstWins', 'First to finish wins'],
  ['playForPlaces', 'Play on for places'],
]

export function Setup({ onStart, onBack }: { onStart: (settings: Settings, seats: Seats) => void; onBack: () => void }) {
  const [mode, setMode] = useState<ModeName>('ghana')
  const [rules, setRules] = useState<Rules>({ ...MODES.ghana.rules })
  const [afterKick, setAfterKick] = useState<AfterKick>(MODES.ghana.afterKick)
  const [players, setPlayers] = useState<Settings['players']>(4)
  const [seats, setSeats] = useState<Seats>({ red: 'human' })
  const [endCondition, setEndCondition] = useState<EndCondition>('firstWins')

  function pickMode(next: ModeName) {
    setMode(next)
    setRules({ ...MODES[next].rules })
    setAfterKick(MODES[next].afterKick)
  }

  function start() {
    const chosen = Object.fromEntries(SEATS[players].map((color) => [color, seats[color] ?? 'computer'])) as Seats
    onStart({ ...settingsFor(mode, players, endCondition), rules, afterKick }, chosen)
  }

  return (
    <main className="screen setup">
      <h1>New game</h1>

      <fieldset>
        <legend>Mode</legend>
        {(Object.keys(MODE_NAME) as ModeName[]).map((name) => (
          <label key={name}>
            <input type="radio" name="mode" checked={mode === name} onChange={() => pickMode(name)} />
            {MODE_NAME[name]}
          </label>
        ))}
      </fieldset>

      <details>
        <summary>Customise rules</summary>
        <div className="rule-checks">
          {RULE_NAME.map(([key, name]) => (
            <label key={key}>
              <input type="checkbox" checked={rules[key]} onChange={(e) => setRules({ ...rules, [key]: e.target.checked })} />
              {name}
            </label>
          ))}
        </div>
        <div className="rule-after-kick">
          <label htmlFor="after-kick">After a kick</label>
          <select id="after-kick" value={afterKick} onChange={(e) => setAfterKick(e.target.value as AfterKick)}>
            {AFTER_KICK.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </details>

      <fieldset>
        <legend>Players</legend>
        {([2, 3, 4] as const).map((n) => (
          <label key={n}>
            <input type="radio" name="players" checked={players === n} onChange={() => setPlayers(n)} />
            {n} players
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Seats</legend>
        {SEATS[players].map((color) => (
          <span key={color} className="seat">
            <label htmlFor={`seat-${color}`}>{COLOR_NAME[color]} player</label>
            <select
              id={`seat-${color}`}
              value={seats[color] ?? 'computer'}
              onChange={(e) => setSeats({ ...seats, [color]: e.target.value as Seat })}
            >
              <option value="human">Human</option>
              <option value="computer">Computer</option>
            </select>
          </span>
        ))}
      </fieldset>

      <fieldset>
        <legend>Winning</legend>
        {END.map(([value, name]) => (
          <label key={value}>
            <input type="radio" name="end" checked={endCondition === value} onChange={() => setEndCondition(value)} />
            {name}
          </label>
        ))}
      </fieldset>

      <div className="actions">
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="primary" onClick={start}>
          Start game
        </button>
      </div>
    </main>
  )
}
