import type { GameEvent, GameState, ModeName, Settings, TurnTimer } from '@ludo/engine'
import { useEffect, useRef, useState } from 'react'
import type { Dice } from './dice'
import { audio } from './fx/audio'
import { back, depth, onPop, push, replace, restart } from './navigation'
import { createRoom, quickMatch } from './online/api'
import { PlayOnline, type Step } from './online/PlayOnline'
import { QuickMatch } from './online/QuickMatch'
import { RoomScreen } from './online/RoomScreen'
import { GameScreen } from './screens/GameScreen'
import { Home } from './screens/Home'
import { Results } from './screens/Results'
import { Setup } from './screens/Setup'
import { clearGame, loadDevice, loadEffects, loadGame, loadHand, loadMusic, loadName, loadQuickMode, loadSound, loadTheme, saveEffects, saveGame, saveHand, saveMusic, saveName, saveQuickMode, saveSound, saveTheme } from './storage'
import type { EffectsLevel, Hand, Seats, ThemePref } from './types'
import { setPlaying } from './update'
import { useTheme } from './useTheme'
import type { Timing } from './useGame'

type Dest = 'quick' | 'find' | 'choice'

type Screen =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'game'; settings: Settings; seats: Seats; log?: GameEvent[]; key: number }
  | { name: 'results'; game: GameState; settings: Settings; seats: Seats }
  /** `code`: the room a link opened, joined once there's a name. `then`: where to go once there is one. */
  | { name: 'online'; step: Step; code?: string; then?: Dest }
  /** `request`: the quick match being looked for, while it is. */
  | { name: 'quick'; error?: string; request?: number }
  | { name: 'find' }
  /** `request`: the room being made, while it is. */
  | { name: 'create'; error?: string; request?: number }
  /** `quick`: a quick match brought you here; `retried` once it skipped a room with no seat for you. */
  | { name: 'room'; code: string; quick?: { mode: ModeName; retried: boolean } }

/** The screen to open on: a room link (`/r/KQMZ`) opens that room, once there's a name to join with. */
function firstScreen(): Screen {
  const linked = location.pathname.match(/^\/r\/([A-Za-z]{4})$/)?.[1]?.toUpperCase()
  if (!linked) return { name: 'home' }
  return loadName() ? { name: 'room', code: linked } : { name: 'online', step: 'name', code: linked }
}

// What a history entry keeps of a screen: a game or the results can't be come back to, a room being made starts over.
type Route = Screen | { name: 'game' | 'results' }
const routeOf = (screen: Screen): Route =>
  screen.name === 'game' || screen.name === 'results' ? { name: screen.name } : screen.name === 'create' || screen.name === 'quick' ? { name: screen.name } : screen
// A room's link stays in the address bar, also on the name screen it opened, so a refresh keeps it.
const urlOf = (screen: Screen) => (screen.name === 'room' || screen.name === 'online') && screen.code ? `/r/${screen.code}` : '/'

export function App({ dice, timing }: { dice: Dice; timing: Timing }) {
  const [screen, setScreen] = useState<Screen>(firstScreen)
  const current = useRef(screen)
  current.current = screen
  const [device] = useState(loadDevice)
  const [name, setName] = useState(loadName)
  const changeName = (next: string) => {
    saveName(next)
    setName(next)
  }
  const [quickMode, setQuickMode] = useState(loadQuickMode)
  const changeQuickMode = (next: ModeName) => {
    saveQuickMode(next)
    setQuickMode(next)
  }
  const [saved, setSaved] = useState(loadGame)
  const [hand, setHand] = useState(loadHand)
  const changeHand = (next: Hand) => {
    saveHand(next)
    setHand(next)
  }
  const [effectsLevel, setEffectsLevel] = useState(loadEffects)
  const changeEffects = (next: EffectsLevel) => {
    saveEffects(next)
    setEffectsLevel(next)
  }
  const [sound, setSound] = useState(loadSound)
  const changeSound = (on: boolean) => {
    saveSound(on)
    setSound(on)
  }
  const [music, setMusic] = useState(loadMusic)
  const changeMusic = (on: boolean) => {
    saveMusic(on)
    setMusic(on)
  }
  const [theme, setTheme] = useState(loadTheme)
  const changeTheme = (next: ThemePref) => {
    saveTheme(next)
    setTheme(next)
  }
  useTheme(theme)
  // An online room counts as a game, so an app update waits for it.
  useEffect(() => setPlaying(screen.name === 'game' || screen.name === 'room'), [screen.name])
  useEffect(() => audio.setPrefs({ sound, music }), [sound, music])

  // Each screen moved on to is a history entry, so back steps back through them.
  const go = (next: Screen) => {
    setScreen(next)
    push(routeOf(next), urlOf(next))
  }
  const goHome = () => {
    setSaved(loadGame())
    setScreen({ name: 'home' })
    restart({ name: 'home' }, '/')
  }
  // The on-screen back buttons do what the back gesture does.
  const goBack = () => (depth() ? back() : goHome())
  const goTo = (dest: Dest) => go(dest === 'quick' ? { name: 'quick' } : dest === 'find' ? { name: 'find' } : { name: 'online', step: 'choice' })
  // Online play needs a name first.
  const online = (dest: Dest) => (name.trim() ? goTo(dest) : go({ name: 'online', step: 'name', then: dest }))
  const startGame = (settings: Settings, seats: Seats, log?: GameEvent[]) => go({ name: 'game', settings, seats, log, key: Date.now() })

  useEffect(() => {
    // Opening (or reloading) on home starts the history afresh; a room keeps the entries below it.
    const first = current.current
    if (first.name === 'home') restart(routeOf(first), urlOf(first))
    else replace(routeOf(first), urlOf(first))
    return onPop((route) => {
      const now = current.current.name
      // Back from a game, the results or a room goes all the way home: the game is saved, the room left.
      if (now === 'game' || now === 'results' || now === 'room') return goHome()
      const next = route as Route | undefined
      if (!next || next.name === 'home' || next.name === 'results') return goHome()
      if (next.name === 'game') {
        const game = loadGame()
        return game ? setScreen({ name: 'game', settings: game.settings, seats: game.seats, log: game.log, key: Date.now() }) : goHome()
      }
      setScreen(next as Screen)
    })
  }, [])
  const prefs = { hand, onHand: changeHand, theme, onTheme: changeTheme }

  // Create room and quick match are held while the server answers.
  const requests = useRef(0)
  /** The answer to a request only counts if you're still waiting for that one. */
  const waitingFor = (request: number) => {
    const now = current.current
    return (now.name === 'create' || now.name === 'quick') && now.request === request
  }

  async function create(settings: Settings, timer: TurnTimer, open: boolean) {
    const request = ++requests.current
    setScreen({ name: 'create', request })
    try {
      const code = await createRoom({ device, name, settings, timer, open })
      if (waitingFor(request)) go({ name: 'room', code })
    } catch (e) {
      const error = (e as Error).message === 'too_fast' ? 'Too many new rooms. Try again in a minute.' : 'Couldn’t make the room. Check your connection and try again.'
      if (waitingFor(request)) setScreen({ name: 'create', error })
    }
  }

  /** `skip`: a room that had no seat for you, so this is the one retry. */
  async function findGame(mode: ModeName, skip?: string) {
    const request = ++requests.current
    const next: Screen = { name: 'quick', request }
    // Known at once: the retry starts from a room's effect, and its answer can beat the next render.
    current.current = next
    setScreen(next)
    // The retry stands in for the room that had no seat, so its link leaves the address bar.
    if (skip) replace(routeOf(next), urlOf(next))
    try {
      const code = await quickMatch({ device, name, mode, skip })
      if (waitingFor(request)) go({ name: 'room', code, quick: { mode, retried: skip !== undefined } })
    } catch (e) {
      const error = (e as Error).message === 'too_fast' ? 'Too many new games. Try again in a minute.' : 'Couldn’t find a game. Check your connection and try again.'
      if (waitingFor(request)) setScreen({ name: 'quick', error })
    }
  }

  switch (screen.name) {
    case 'home':
      return (
        <Home
          canContinue={saved !== undefined}
          hand={hand}
          onNew={() => go({ name: 'setup' })}
          onQuick={() => online('quick')}
          onFind={() => online('find')}
          onFriends={() => online('choice')}
          onContinue={() => startGame(saved!.settings, saved!.seats, saved!.log)}
        />
      )
    case 'setup':
      return <Setup onBack={goBack} onStart={(settings, seats) => startGame(settings, seats)} {...prefs} />
    case 'game':
      return (
        <GameScreen
          key={screen.key}
          options={{
            settings: screen.settings,
            seats: screen.seats,
            log: screen.log,
            dice,
            timing,
            onChange: (game) => saveGame({ settings: screen.settings, seats: screen.seats, log: game.log }),
          }}
          hand={hand}
          onHand={changeHand}
          theme={theme}
          onTheme={changeTheme}
          effectsLevel={effectsLevel}
          onEffectsLevel={changeEffects}
          sound={sound}
          onSound={changeSound}
          music={music}
          onMusic={changeMusic}
          onQuit={goHome}
          onRestart={() => startGame(screen.settings, screen.seats)}
          onFinish={(game) => {
            clearGame()
            setSaved(undefined)
            go({ name: 'results', game, settings: screen.settings, seats: screen.seats })
          }}
        />
      )
    case 'results':
      return <Results game={screen.game} onPlayAgain={() => startGame(screen.settings, screen.seats)} onHome={goHome} />
    case 'online':
      return (
        <PlayOnline
          name={name}
          step={screen.step}
          code={screen.code}
          onName={changeName}
          onStep={(step) => go({ name: 'online', step, code: screen.code })}
          onNamed={() => goTo(screen.then ?? 'choice')}
          onCreate={() => go({ name: 'create' })}
          onJoin={(code) => go({ name: 'room', code })}
          onBack={goBack}
        />
      )
    case 'quick':
      return (
        <QuickMatch
          mode={quickMode}
          onMode={changeQuickMode}
          busy={screen.request !== undefined}
          error={screen.error}
          onGo={() => findGame(quickMode)}
          onCancel={() => setScreen({ name: 'quick' })}
          onBack={goBack}
        />
      )
    case 'find':
      return (
        <main className="screen message">
          <p>Coming soon</p>
        </main>
      )
    case 'create':
      return <Setup onBack={goBack} {...prefs} online={{ submitLabel: 'Create room', onCreate: create, error: screen.error, busy: screen.request !== undefined }} />
    case 'room': {
      const { quick } = screen
      return (
        <RoomScreen
          key={screen.code}
          code={screen.code}
          device={device}
          name={name}
          timing={timing}
          onLeave={goHome}
          onNoSeat={quick && (() => (quick.retried ? go({ name: 'quick', error: 'Couldn’t find a seat. Try again.' }) : findGame(quick.mode, screen.code)))}
          prefs={{ ...prefs, effectsLevel, onEffectsLevel: changeEffects, sound, onSound: changeSound, music, onMusic: changeMusic }}
        />
      )
    }
  }
}
