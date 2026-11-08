import type { GameViewProps } from '../screens/GameView'
import type { useOnlineGame } from './useOnlineGame'

/** This device's own settings, which stay the same in every game and room. */
export type DevicePrefs = Pick<GameViewProps, 'hand' | 'onHand' | 'theme' | 'onTheme' | 'effectsLevel' | 'onEffectsLevel' | 'sound' | 'onSound' | 'music' | 'onMusic'>

type Props = DevicePrefs & { online: ReturnType<typeof useOnlineGame>; onLeave: () => void }

/** A room's game. The board comes in the next step; for now it only says a game is on. */
export function OnlineGame({ onLeave }: Props) {
  return (
    <main className="screen message">
      <p>Game in progress</p>
      <button type="button" className="secondary" onClick={onLeave}>
        Leave room
      </button>
    </main>
  )
}
