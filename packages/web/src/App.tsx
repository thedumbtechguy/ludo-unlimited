import type { GameEvent, GameState, Settings, TurnTimer } from '@ludo/engine'
import { useEffect, useRef, useState } from 'react'
import type { Dice } from './dice'
import { audio } from './fx/audio'
import { createRoom } from './online/api'
import { PlayOnline } from './online/PlayOnline'
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
  | { name: 'online'; code?: string }
  | { name: 'create'; error?: string }
  | { name: 'room'; code: string }

/** The screen to open on: a room link (`/r/KQMZ`) opens that room, once there's a name to join with. */
function firstScreen(): Screen {
  const linked = location.pathname.match(/^\/r\/([A-Za-z]{4})$/)?.[1]?.toUpperCase()
  if (!linked) return { name: 'home' }
  return loadName() ? { name: 'room', code: linked } : { name: 'online', code: linked }
}

export function App({ dice, timing }: { dice: Dice; timing: Timing }) {
  const [screen, setScreen] = useState<Screen>(firstScreen)
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
  const roomCode = screen.name === 'room' ? screen.code : undefined
  useEffect(() => history.replaceState(null, '', roomCode ? `/r/${roomCode}` : '/'), [roomCode])
  useEffect(() => audio.setPrefs({ sound, music }), [sound, music])

  const startGame = (settings: Settings, seats: Seats, log?: GameEvent[]) =>
    setScreen({ name: 'game', settings, seats, log, key: Date.now() })
  const goHome = () => {
    setSaved(loadGame())
    setScreen({ name: 'home' })
  }
  const prefs = { hand, onHand: changeHand, theme, onTheme: changeTheme }

  // One room per tap on Create room, however fast the taps.
  const creating = useRef(false)
  async function create(settings: Settings, timer: TurnTimer) {
    if (creating.current) return
    creating.current = true
    try {
      const code = await createRoom({ device, name, settings, timer })
      setScreen({ name: 'room', code })
    } catch (e) {
      const error = (e as Error).message === 'too_fast' ? 'Too many new rooms. Try again in a minute.' : 'Couldn’t make the room. Check your connection and try again.'
      setScreen({ name: 'create', error })
    } finally {
      creating.current = false
    }
  }

  switch (screen.name) {
    case 'home':
      return (
        <Home
          canContinue={saved !== undefined}
          hand={hand}
          onNew={() => setScreen({ name: 'setup' })}
          onOnline={() => setScreen({ name: 'online' })}
          onContinue={() => startGame(saved!.settings, saved!.seats, saved!.log)}
        />
      )
    case 'setup':
      return <Setup onBack={goHome} onStart={(settings, seats) => startGame(settings, seats)} {...prefs} />
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
            setScreen({ name: 'results', game, settings: screen.settings, seats: screen.seats })
          }}
        />
      )
    case 'results':
      return <Results game={screen.game} onPlayAgain={() => startGame(screen.settings, screen.seats)} onHome={goHome} />
    case 'online':
      return (
        <PlayOnline
          name={name}
          code={screen.code}
          onName={changeName}
          onCreate={() => setScreen({ name: 'create' })}
          onJoin={(code) => setScreen({ name: 'room', code })}
          onBack={goHome}
        />
      )
    case 'create':
      return <Setup onBack={() => setScreen({ name: 'online' })} onStart={() => {}} {...prefs} online={{ submitLabel: 'Create room', onCreate: create, error: screen.error }} />
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
