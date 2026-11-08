import type { GameEvent, GameState, Settings, TurnTimer } from '@ludo/engine'
import { useEffect, useRef, useState } from 'react'
import type { Dice } from './dice'
import { audio } from './fx/audio'
import { back, depth, onPop, push, replace, restart } from './navigation'
import { createRoom } from './online/api'
import { PlayOnline, type Step } from './online/PlayOnline'
import { RoomScreen } from './online/RoomScreen'
import { GameScreen } from './screens/GameScreen'
import { Home } from './screens/Home'
import { Results } from './screens/Results'
import { Setup } from './screens/Setup'
import { clearGame, loadDevice, loadEffects, loadGame, loadHand, loadMusic, loadName, loadSound, loadTheme, saveEffects, saveGame, saveHand, saveMusic, saveName, saveSound, saveTheme } from './storage'
import type { EffectsLevel, Hand, Seats, ThemePref } from './types'
import { setPlaying } from './update'
import { useTheme } from './useTheme'
import type { Timing } from './useGame'

type Screen =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'game'; settings: Settings; seats: Seats; log?: GameEvent[]; key: number }
  | { name: 'results'; game: GameState; settings: Settings; seats: Seats }
  /** `code`: the room a link opened, joined once there's a name. */
  | { name: 'online'; step: Step; code?: string }
  /** `request`: the room being made, while it is. */
  | { name: 'create'; error?: string; request?: number }
  | { name: 'room'; code: string }

/** The screen to open on: a room link (`/r/KQMZ`) opens that room, once there's a name to join with. */
function firstScreen(): Screen {
  const linked = location.pathname.match(/^\/r\/([A-Za-z]{4})$/)?.[1]?.toUpperCase()
  if (!linked) return { name: 'home' }
  return loadName() ? { name: 'room', code: linked } : { name: 'online', step: 'name', code: linked }
}

// What a history entry keeps of a screen: a game or the results can't be come back to, a room being made starts over.
type Route = Screen | { name: 'game' | 'results' }
const routeOf = (screen: Screen): Route =>
  screen.name === 'game' || screen.name === 'results' ? { name: screen.name } : screen.name === 'create' ? { name: 'create' } : screen
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

  // Create room is held while the room is made. Its answer only counts if you're still waiting for that one.
  const requests = useRef(0)
  async function create(settings: Settings, timer: TurnTimer) {
    const request = ++requests.current
    setScreen({ name: 'create', request })
    const stillHere = () => {
      const now = current.current
      return now.name === 'create' && now.request === request
    }
    try {
      const code = await createRoom({ device, name, settings, timer })
      if (stillHere()) go({ name: 'room', code })
    } catch (e) {
      const error = (e as Error).message === 'too_fast' ? 'Too many new rooms. Try again in a minute.' : 'Couldn’t make the room. Check your connection and try again.'
      if (stillHere()) setScreen({ name: 'create', error })
    }
  }

  switch (screen.name) {
    case 'home':
      return (
        <Home
          canContinue={saved !== undefined}
          hand={hand}
          onNew={() => go({ name: 'setup' })}
          onOnline={() => go({ name: 'online', step: name.trim() ? 'choice' : 'name' })}
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
          onCreate={() => go({ name: 'create' })}
          onJoin={(code) => go({ name: 'room', code })}
          onBack={goBack}
        />
      )
    case 'create':
      return <Setup onBack={goBack} {...prefs} online={{ submitLabel: 'Create room', onCreate: create, error: screen.error, busy: screen.request !== undefined }} />
    case 'room':
      return (
        <RoomScreen
          key={screen.code}
          code={screen.code}
          device={device}
          name={name}
          timing={timing}
          onLeave={goHome}
          prefs={{ ...prefs, effectsLevel, onEffectsLevel: changeEffects, sound, onSound: changeSound, music, onMusic: changeMusic }}
        />
      )
  }
}
