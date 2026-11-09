import { MODES, SEATS, type AfterKick, type Color, type EndCondition, type ModeName, type Rules, type Settings, type TurnTimer } from '@ludo/engine'
import { useId, useState } from 'react'
import { Chevron, Picker, SwitchMark } from '../components/Picker'
import { Sheet } from '../components/Sheet'
import { AFTER_KICK, COLOR_NAME, END, LEVELS, levelName, modeOf, seatNames, TIMERS, WHO_CAN_JOIN } from '../labels'
import { COLOR_HEX } from '../theme'
import type { Hand, Seats, ThemePref } from '../types'

const RULE_NAME: [keyof Rules, string][] = [
  ['backKick', 'Back Kick'],
  ['lineKick', 'Line Kick'],
  ['homeKick', 'Home Kick'],
  ['labourer', 'Labourer'],
]
const PLAYERS = [
  [2, '2 players'],
  [3, '3 players'],
  [4, '4 players'],
] as const
const HANDS = [
  ['right', 'Right'],
  ['left', 'Left'],
] as const

const THEMES = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
] as const

const labelOf = <T,>(options: readonly (readonly [T, string, ...string[]])[], value: T) => options.find(([v]) => v === value)![1]

type Open = 'players' | 'afterKick' | 'end' | 'timer' | 'join' | 'rules' | 'hand' | 'theme'
type Props = {
  /** Local games only. */
  onStart?: (settings: Settings, seats: Seats) => void
  onBack: () => void
  hand: Hand
  onHand: (hand: Hand) => void
  theme: ThemePref
  onTheme: (theme: ThemePref) => void
  /**
   * Online: no seats (they fill as people join), a turn timer, who can join, and `onCreate` instead of `onStart`.
   * `error` shows above the button; `busy` holds the button while the room is being made.
   */
  online?: {
    initial?: { settings: Settings; timer: TurnTimer; open: boolean }
    submitLabel: string
    onCreate: (settings: Settings, timer: TurnTimer, open: boolean) => void
    error?: string
    busy?: boolean
  }
}

export function Setup({ onStart, onBack, hand, onHand, theme, onTheme, online }: Props) {
  const initial = online?.initial
  const [mode, setMode] = useState<ModeName>(initial ? (modeOf(initial.settings.rules) ?? 'ghana') : 'ghana')
  const [rules, setRules] = useState<Rules>(initial?.settings.rules ?? { ...MODES.ghana.rules })
  const [afterKick, setAfterKick] = useState<AfterKick>(initial?.settings.afterKick ?? MODES.ghana.afterKick)
  const [players, setPlayers] = useState<Settings['players']>(initial?.settings.players ?? 4)
  const [seats, setSeats] = useState<Seats>({ red: 'human' })
  const [endCondition, setEndCondition] = useState<EndCondition>(initial?.settings.endCondition ?? 'firstWins')
  const [timer, setTimer] = useState<TurnTimer>(initial?.timer ?? 'normal')
  const [anyone, setAnyone] = useState(initial?.open ?? false)
  const [open, setOpen] = useState<Open>()
  const [levelFor, setLevelFor] = useState<Color>()
  const summaryId = useId()

  const close = () => setOpen(undefined)
  const seated = SEATS[players]
  const names = seatNames(seats, seated)
  const custom = RULE_NAME.some(([key]) => rules[key] !== MODES[mode].rules[key])
  const summary = custom ? 'Custom' : mode === 'ghana' ? 'All kicks, Labourer' : 'Plain Ludo'

  function toggleMode() {
    const next = mode === 'ghana' ? 'classic' : 'ghana'
    setMode(next)
    setRules({ ...MODES[next].rules })
    setAfterKick(MODES[next].afterKick)
  }

  function start() {
    const chosen = Object.fromEntries(seated.map((color) => [color, seats[color] ?? 'normal'])) as Seats
    onStart?.({ players, endCondition, rules, afterKick }, chosen)
  }

  const pickerRow = (name: Open, label: string, value?: string) => (
    <button type="button" className="row" aria-haspopup="dialog" onClick={() => setOpen(name)}>
      <span className="row-label">{label}</span>
      {value && <span className="row-value">{value}</span>}
      <Chevron />
    </button>
  )

  return (
    <main className="screen setup">
      <header className="setup-head">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <h1>{online ? (online.initial ? 'Room settings' : 'New room') : 'New game'}</h1>
      </header>

      <section aria-labelledby="players-heading">
        <h2 id="players-heading" className="section-heading">
          Players
        </h2>
        {pickerRow('players', 'Players', `${players}`)}
        {initial && <p className="row-note setup-note">People on removed seats go back to watching.</p>}
        {!online &&
          seated.map((color) => {
            const seat = seats[color] ?? 'normal'
            const human = seat === 'human'
            return (
              <div key={color} className="row">
                <span className="dot" style={{ background: COLOR_HEX[color] }} />
                <span className="row-label">{COLOR_NAME[color]}</span>
                {seat !== 'human' && (
                  <button type="button" className="level-button" aria-haspopup="dialog" aria-label={`${COLOR_NAME[color]} computer level: ${levelName(seat)}`} onClick={() => setLevelFor(color)}>
                    {levelName(seat)}
                    <Chevron />
                  </button>
                )}
                <button
                  type="button"
                  className={human ? 'seat-button human' : 'seat-button'}
                  aria-label={`${COLOR_NAME[color]} player: ${names[color]}`}
                  onClick={() => setSeats({ ...seats, [color]: human ? 'normal' : 'human' })}
                >
                  {names[color]}
                </button>
              </div>
            )
          })}
      </section>

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="section-heading">
          Rules
        </h2>
        <button type="button" role="switch" aria-checked={mode === 'ghana'} aria-label="Ghana rules" aria-describedby={summaryId} className="row" onClick={toggleMode}>
          <span className="row-label">Ghana rules</span>
          <span id={summaryId} className="row-note">
            {summary}
          </span>
          <SwitchMark on={mode === 'ghana'} />
        </button>
        {pickerRow('afterKick', 'After a kick', labelOf(AFTER_KICK, afterKick))}
        {pickerRow('end', 'Game ends', labelOf(END, endCondition))}
        {online && pickerRow('timer', 'Turn timer', labelOf(TIMERS, timer))}
        {online && pickerRow('join', 'Who can join', labelOf(WHO_CAN_JOIN, anyone ? 'anyone' : 'friends'))}
        {pickerRow('rules', 'Choose rules one by one')}
      </section>

      <section aria-labelledby="device-heading">
        <h2 id="device-heading" className="section-heading">
          This device
        </h2>
        {pickerRow('hand', 'Playing hand', labelOf(HANDS, hand))}
        {pickerRow('theme', 'Theme', labelOf(THEMES, theme))}
      </section>

      {online?.error && (
        <p role="alert" className="setup-error">
          {online.error}
        </p>
      )}
      <button
        type="button"
        className="primary start"
        disabled={online?.busy}
        onClick={() => (online ? online.onCreate({ players, endCondition, rules, afterKick }, timer, anyone) : start())}
      >
        {online?.busy ? 'Creating…' : (online?.submitLabel ?? 'Start game')}
      </button>

      {open === 'players' && <Picker title="Players" options={PLAYERS} value={players} onPick={setPlayers} onClose={close} />}
      {open === 'afterKick' && <Picker title="After a kick" options={AFTER_KICK} value={afterKick} onPick={setAfterKick} onClose={close} />}
      {open === 'end' && <Picker title="Game ends" options={END} value={endCondition} onPick={setEndCondition} onClose={close} />}
      {open === 'timer' && <Picker title="Turn timer" options={TIMERS} value={timer} onPick={setTimer} onClose={close} />}
      {open === 'join' && <Picker title="Who can join" options={WHO_CAN_JOIN} value={anyone ? 'anyone' : 'friends'} onPick={(v) => setAnyone(v === 'anyone')} onClose={close} />}
      {open === 'hand' && <Picker title="Playing hand" options={HANDS} value={hand} onPick={onHand} onClose={close} />}
      {open === 'theme' && <Picker title="Theme" options={THEMES} value={theme} onPick={onTheme} onClose={close} />}
      {levelFor && (
        <Picker
          title={`${COLOR_NAME[levelFor]} computer`}
          options={LEVELS}
          value={seats[levelFor] === 'human' ? 'normal' : (seats[levelFor] ?? 'normal')}
          onPick={(level) => setSeats({ ...seats, [levelFor]: level })}
          onClose={() => setLevelFor(undefined)}
        />
      )}
      {open === 'rules' && (
        <Sheet title="Choose rules one by one" onClose={close}>
          <div className="sheet-rows">
            {RULE_NAME.map(([key, name]) => (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={rules[key]}
                className="sheet-row"
                onClick={() => setRules({ ...rules, [key]: !rules[key] })}
              >
                {name}
                <SwitchMark on={rules[key]} />
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </main>
  )
}
