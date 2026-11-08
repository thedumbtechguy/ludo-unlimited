import { currentMover, type GameState, type Move } from '@ludo/engine'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Board } from '../components/Board'
import { BoardFx } from '../fx/BoardFx'
import { FxLayer } from '../fx/FxLayer'
import { DiceFire, OnFire, StreakLabel, useSixStreak } from '../fx/SixStreak'
import { useGameAudio } from '../fx/useGameAudio'
import { DiceButton } from '../components/DiceButton'
import { KickCallout } from '../components/KickCallout'
import { RollTray } from '../components/RollTray'
import { Sheet } from '../components/Sheet'
import { SwitchMark } from '../components/Picker'
import { firstHuman, rulesName, seatNames, turnTag, wastedText } from '../labels'
import { quarterTurns, viewerOf } from '../layout'
import type { EffectsLevel, Hand } from '../types'
import { COLOR_HEX } from '../theme'
import { useGame, type GameOptions } from '../useGame'

type Props = {
  options: GameOptions
  hand: Hand
  onHand: (hand: Hand) => void
  effectsLevel: EffectsLevel
  onEffectsLevel: (level: EffectsLevel) => void
  sound: boolean
  onSound: (on: boolean) => void
  music: boolean
  onMusic: (on: boolean) => void
  onFinish: (game: GameState) => void
  onQuit: () => void
  onRestart: () => void
}

const HAND_NAME: Record<Hand, string> = { right: 'Right', left: 'Left' }
const EFFECTS_NAME: Record<EffectsLevel, string> = { full: 'Full', reduced: 'Reduced' }

export function GameScreen({ options, hand, onHand, effectsLevel, onEffectsLevel, sound, onSound, music, onMusic, onFinish, onQuit, onRestart }: Props) {
  const g = useGame(options)
  const { game } = g
  // The destination being hovered or focused, so the tray can light up the rolls it would use.
  const [preview, setPreview] = useState<Move>()
  const [menuOpen, setMenuOpen] = useState(false)
  const dice = useRef<HTMLDivElement>(null)
  const play = useRef<HTMLDivElement>(null)
  const streak = useSixStreak(g.effects, game.turn)
  useGameAudio({ enabled: options.timing.step > 0, streak: streak.count })
  useEffect(() => setPreview(undefined), [game])

  useEffect(() => {
    if (game.status === 'finished' && !g.moving) onFinish(game)
  }, [game, g.moving])

  const mover = currentMover(game) ?? game.turn
  const colors = game.players.map((p) => p.color)
  // Seats never change during a game, so neither does the turn of the board (only the hand preference can).
  const you = viewerOf(options.seats, colors)
  const turn = quarterTurns(you, hand)
  const hint = g.humanToRoll
    ? 'Tap the dice to roll'
    : g.humanToMove
      ? g.movable.length > 1 && !g.selected
        ? 'Tap a numbered square, or a piece'
        : 'Tap a marked square'
      : ''
  // Only a person's own wasted roll is worth a word; a computer's is just noise.
  const noMove = g.wasted && options.seats[g.wasted.color] === 'human' ? wastedText(g.wasted, you) : undefined

  return (
    // Effects are skipped when timing is instant (the browser tests' ?fast), so they never slow a game down.
    <FxLayer level={effectsLevel} enabled={options.timing.step > 0}>
      <main className="game">
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

        <div className="play" ref={play}>
          {/* Phones: the empty table above the board, where "On fire" goes. */}
          <div className="fire-slot" data-hand={hand}>
            <OnFire count={streak.count} place="phone" />
          </div>
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
          >
            <KickCallout callout={g.callout} />
            <BoardFx effects={g.effects} state={game} turn={turn} area={play} />
          </Board>
          {/* Fixed heights throughout, so nothing jumps as the turn moves on. */}
          {/* On phones the dice sits under the playing hand's thumb. */}
          <section className="controls" aria-label="Dice" data-hand={hand}>
            <div className="dice-slot" ref={dice}>
              <p className="turn-label" style={{ '--turn-color': COLOR_HEX[mover] } as CSSProperties}>
                <span className="turn-dot" aria-hidden="true" />
                {turnTag(mover, you)}
              </p>
              <DiceButton value={g.lastRoll} rolling={g.rolling} target={g.rollingTo} disabled={!g.humanToRoll} onRoll={g.roll} />
              <OnFire count={streak.count} place="desk" />
              <StreakLabel count={streak.count} />
            </div>
            <DiceFire dice={dice} streak={streak} />
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
                  <p className="hint">
                    {noMove && <span className="hint-note">{noMove}</span>}
                    <span>{hint}</span>
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        <p className="sr-only" role="status">
          {g.message ?? noMove ?? ''}
        </p>

        {menuOpen && (
          <Sheet title="Menu" hideTitle onClose={() => setMenuOpen(false)}>
            <div className="sheet-rows">
              <button
                type="button"
                className="sheet-row"
                aria-label={`Playing hand: ${HAND_NAME[hand]}`}
                onClick={() => onHand(hand === 'right' ? 'left' : 'right')}
              >
                <span>Playing hand</span>
                <span className="row-value">{HAND_NAME[hand]}</span>
              </button>
              <button
                type="button"
                className="sheet-row"
                aria-label={`Effects: ${EFFECTS_NAME[effectsLevel]}`}
                onClick={() => onEffectsLevel(effectsLevel === 'full' ? 'reduced' : 'full')}
              >
                <span>Effects</span>
                <span className="row-value">{EFFECTS_NAME[effectsLevel]}</span>
              </button>
              <button type="button" role="switch" aria-checked={sound} aria-label="Sound" className="sheet-row" onClick={() => onSound(!sound)}>
                <span>Sound</span>
                <SwitchMark on={sound} />
              </button>
              <button type="button" role="switch" aria-checked={music} aria-label="Music" className="sheet-row" onClick={() => onMusic(!music)}>
                <span>Music</span>
                <SwitchMark on={music} />
              </button>
            </div>
            {/* Leaving the game sits apart, at the bottom, away from the settings. */}
            <div className="sheet-rows sheet-exits">
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
              <button type="button" className="sheet-row" onClick={onQuit}>
                Quit to home
              </button>
            </div>
          </Sheet>
        )}
      </main>
    </FxLayer>
  )
}
