import { currentMover, type GameState } from '@ludo/engine'
import { useEffect } from 'react'
import { Board } from '../components/Board'
import { DiceButton } from '../components/DiceButton'
import { COLOR_NAME } from '../labels'
import { COLOR_HEX, ON_COLOR } from '../theme'
import { useGame, type GameOptions } from '../useGame'

export function GameScreen({ options, onFinish, onQuit }: { options: GameOptions; onFinish: (game: GameState) => void; onQuit: () => void }) {
  const g = useGame(options)
  const { game } = g

  useEffect(() => {
    if (game.status === 'finished' && !g.moving) onFinish(game)
  }, [game, g.moving])

  const mover = currentMover(game) ?? game.turn
  const banner =
    mover !== game.turn
      ? `${COLOR_NAME[mover]} moves with ${COLOR_NAME[game.turn]}'s roll`
      : `${COLOR_NAME[game.turn]} to ${game.pendingRoll === undefined ? 'roll' : 'move'}`

  return (
    <main className="screen game">
      <Board
        state={game}
        moving={g.moving}
        movable={g.movable}
        selected={g.selected}
        targets={g.targets}
        onSelectPiece={g.select}
        onPickTarget={g.play}
        onDeselect={g.deselect}
      />
      <aside className="panel">
        <p className="banner" style={{ background: COLOR_HEX[mover], color: ON_COLOR[mover] }}>
          {banner}
        </p>
        <DiceButton value={g.lastRoll} disabled={!g.humanToRoll} onRoll={g.roll} />
        <p className="hint">{g.humanToRoll ? 'Tap the dice to roll' : g.humanToMove ? 'Tap a glowing piece' : ''}</p>
        <p className="message" role="status">
          {g.message ?? ''}
        </p>
        <button type="button" className="secondary" onClick={onQuit}>
          Quit to menu
        </button>
      </aside>
    </main>
  )
}
