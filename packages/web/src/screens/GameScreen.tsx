import { firstHuman, seatNames } from '../labels'
import { viewerOf } from '../layout'
import { useGame, type GameOptions } from '../useGame'
import { GameView, type GameViewProps } from './GameView'

type Props = Omit<GameViewProps, 'g' | 'viewer' | 'you' | 'names' | 'animated' | 'rules' | 'quitLabel'> & { options: GameOptions; onRestart: () => void }

/** A game on this device. */
export function GameScreen({ options, ...rest }: Props) {
  const g = useGame(options)
  const colors = g.game.players.map((p) => p.color)
  return (
    <GameView
      g={g}
      viewer={viewerOf(options.seats, colors)}
      you={firstHuman(options.seats, colors)}
      names={seatNames(options.seats, colors)}
      animated={options.timing.step > 0}
      rules={options.settings.rules}
      quitLabel="Quit to home"
      {...rest}
    />
  )
}
