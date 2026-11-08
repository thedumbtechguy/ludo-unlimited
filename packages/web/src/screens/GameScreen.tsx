import { currentMover, type GameState, type Move } from '@ludo/engine'
import { useEffect, useState, type CSSProperties } from 'react'
import { Board } from '../components/Board'
import { DiceButton } from '../components/DiceButton'
import { RollTray } from '../components/RollTray'
import { Sheet } from '../components/Sheet'
import { firstHuman, rulesName, seatNames } from '../labels'
import { quarterTurns, viewerOf } from '../layout'
import { COLOR_HEX, ON_COLOR } from '../theme'
import type { Hand } from '../types'
import { useGame, type GameOptions } from '../useGame'

type Props = {
  options: GameOptions
  hand: Hand
  onHand: (hand: Hand) => void
  onFinish: (game: GameState) => void
  onQuit: () => void
  onRestart: () => void
}

const HAND_NAME: Record<Hand, string> = { right: 'Right', left: 'Left' }

export function GameScreen({ options, hand, onHand, onFinish, onQuit, onRestart }: Props) {
  const g = useGame(options)
  const { game } = g
  // The destination being hovered or focused, so the tray can light up the rolls it would use.
  const [preview, setPreview] = useState<Move>()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => setPreview(undefined), [game])

  useEffect(() => {
    if (game.status === 'finished' && !g.moving) onFinish(game)
  }, [game, g.moving])

  const mover = currentMover(game) ?? game.turn
  const colors = game.players.map((p) => p.color)
  // Seats never change during a game, so neither does the turn of the board (only the hand preference can).
  const turn = quarterTurns(viewerOf(options.seats, colors), hand)
  const hint = g.humanToRoll
    ? 'Tap the dice to roll'
    : g.humanToMove
      ? g.movable.length > 1 && !g.selected
        ? 'Tap a numbered square, or a piece'
        : 'Tap a marked square'
      : ''
  const noMoves = g.message === 'No moves'
  const shownHint = noMoves ? (hint ? `No moves. ${hint}` : 'No moves') : hint
  // The main button takes the colour of whoever is playing.
  const paint = { '--main': COLOR_HEX[mover], '--on-main': ON_COLOR[mover] } as CSSProperties

  return (
    <main className="game" style={paint}>
      <header className="topbar">
        <span className="title">Ludo Unlimited</span>
        <span className="rules-name">{rulesName(options.settings.rules)}</span>
        <button type="button" className="menu-button" aria-label="Menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
          <span aria-hidden="true">Menu</span>
        </button>
      </header>

      <div className="play">
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
        {/* Fixed heights throughout, so nothing jumps as the turn moves on. */}
        <section className="controls" aria-label="Dice">
          <DiceButton value={g.lastRoll} rolling={g.rolling} target={g.rollingTo} disabled={!g.humanToRoll} onRoll={g.roll} />
          <div className="controls-side">
            <RollTray rolls={g.turnRolls} current={g.currentIndex} using={preview?.rolls} />
            <div className="action-slot">
              {g.canStop ? (
                <div className="roll-again">
                  <button type="button" className="primary" onClick={g.roll}>
                    Roll again
                  </button>
                  <button type="button" className="secondary" onClick={g.stop}>
                    Stop
                  </button>
                </div>
              ) : (
                <p className="hint">{shownHint}</p>
              )}
            </div>
          </div>
        </section>
      </div>

      <p className="sr-only" role="status">
        {g.message ?? ''}
      </p>

      {menuOpen && (
        <Sheet title="Menu" hideTitle onClose={() => setMenuOpen(false)}>
          <div className="sheet-rows">
            <button type="button" className="sheet-row" onClick={onQuit}>
              Quit to home
            </button>
            <button
              type="button"
              className="sheet-row"
              onClick={() => {
                setMenuOpen(false)
                onRestart()
              }}
            >
              Restart game
            </button>
            <button
              type="button"
              className="sheet-row"
              onClick={() => {
                setMenuOpen(false)
                onHand(hand === 'right' ? 'left' : 'right')
              }}
            >
              Playing hand: {HAND_NAME[hand]}
            </button>
          </div>
        </Sheet>
      )}
    </main>
  )
}
