import { currentMover, type GameState, type Move } from '@ludo/engine'
import { useEffect, useState } from 'react'
import { Board } from '../components/Board'
import { DiceButton } from '../components/DiceButton'
import { RollTray } from '../components/RollTray'
import { COLOR_NAME, firstHuman, seatNames } from '../labels'
import { quarterTurns, viewerOf } from '../layout'
import { COLOR_HEX, ON_COLOR } from '../theme'
import type { Hand } from '../types'
import { useGame, type GameOptions } from '../useGame'

type Props = { options: GameOptions; hand: Hand; onFinish: (game: GameState) => void; onQuit: () => void }

export function GameScreen({ options, hand, onFinish, onQuit }: Props) {
  const g = useGame(options)
  const { game } = g
  // The destination being hovered or focused, so the tray can light up the rolls it would use.
  const [preview, setPreview] = useState<Move>()
  useEffect(() => setPreview(undefined), [game])

  useEffect(() => {
    if (game.status === 'finished' && !g.moving) onFinish(game)
  }, [game, g.moving])

  const mover = currentMover(game) ?? game.turn
  const colors = game.players.map((p) => p.color)
  // Seats never change during a game, so neither does the turn of the board (only the hand preference can).
  const turn = quarterTurns(viewerOf(options.seats, colors), hand)
  // Two fixed lines, so the banner keeps its height whatever it says.
  const banner = `${COLOR_NAME[mover]} to ${game.pendingRoll === undefined ? 'roll' : 'move'}`
  const bannerDetail =
    mover !== game.turn
      ? `with ${COLOR_NAME[game.turn]}'s roll (Labourer)`
      : (options.seats[mover] ?? 'computer') === 'computer'
        ? 'Computer playing'
        : ''
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
        turn={turn}
        names={seatNames(options.seats, colors)}
        you={firstHuman(options.seats, colors)}
        active={game.status === 'playing' ? mover : undefined}
      />
      <aside className="panel">
        <div className="banner" style={{ background: COLOR_HEX[mover], color: ON_COLOR[mover] }}>
          <p className="banner-main">{banner}</p>
          <p className="banner-detail">{bannerDetail}</p>
        </div>
        <DiceButton value={g.lastRoll} rolling={g.rolling} target={g.rollingTo} disabled={!g.humanToRoll} onRoll={g.roll} />
        <RollTray rolls={g.turnRolls} current={g.currentIndex} using={preview?.rolls} />
        <p className="hint">{hint}</p>
        {/* The slot keeps its height when the button is gone, so nothing below it moves. */}
        <div className="stop-slot">
          {g.canStop && (
            <button type="button" className="secondary stop" onClick={g.stop}>
              Stop rolling
            </button>
          )}
        </div>
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
