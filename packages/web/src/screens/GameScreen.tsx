import { currentMover, type GameState, type Move } from '@ludo/engine'
import { useEffect, useState } from 'react'
import { Board } from '../components/Board'
import { DiceButton } from '../components/DiceButton'
import { RollTray } from '../components/RollTray'
import { COLOR_NAME } from '../labels'
import { COLOR_HEX, ON_COLOR } from '../theme'
import { useGame, type GameOptions } from '../useGame'

export function GameScreen({ options, onFinish, onQuit }: { options: GameOptions; onFinish: (game: GameState) => void; onQuit: () => void }) {
  const g = useGame(options)
  const { game } = g
  // The destination being hovered or focused, so the tray can light up the rolls it would use.
  const [preview, setPreview] = useState<Move>()
  useEffect(() => setPreview(undefined), [game])

  useEffect(() => {
    if (game.status === 'finished' && !g.moving) onFinish(game)
  }, [game, g.moving])

  const mover = currentMover(game) ?? game.turn
  const banner =
    mover !== game.turn
      ? `${COLOR_NAME[mover]} moves with ${COLOR_NAME[game.turn]}'s roll`
      : `${COLOR_NAME[game.turn]} to ${game.pendingRoll === undefined ? 'roll' : 'move'}`
  const hint = g.humanToRoll
    ? g.canStop
      ? 'Rolled a 6! Roll again or stop'
      : 'Tap the dice to roll'
    : g.humanToMove
      ? g.movable.length > 1 && !g.selected
        ? 'Tap a numbered square, or a piece'
        : 'Tap a marked square'
      : ''

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
        onPreview={setPreview}
      />
      <aside className="panel">
        <p className="banner" style={{ background: COLOR_HEX[mover], color: ON_COLOR[mover] }}>
          {banner}
        </p>
        <DiceButton value={g.lastRoll} rolling={g.rolling} target={g.rollingTo} disabled={!g.humanToRoll} onRoll={g.roll} />
        <RollTray rolls={g.turnRolls} current={g.currentIndex} using={preview?.rolls} />
        <p className="hint">{hint}</p>
        {g.canStop && (
          <button type="button" className="secondary stop" onClick={g.stop}>
            Stop rolling
          </button>
        )}
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
