import { currentMover, type Color, type GameState, type Move, type Rules } from '@ludo/engine'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Board } from '../components/Board'
import { resultsDelay } from '../fx/actions'
import { BoardFx } from '../fx/BoardFx'
import { FxLayer } from '../fx/FxLayer'
import { DiceFire, OnFire, StreakLabel, useSixStreak } from '../fx/SixStreak'
import { useGameAudio } from '../fx/useGameAudio'
import { DiceButton } from '../components/DiceButton'
import { KickCallout } from '../components/KickCallout'
import { RollTray } from '../components/RollTray'
import { Sheet } from '../components/Sheet'
import { SwitchMark } from '../components/Picker'
import { rulesName, turnTag, wastedText } from '../labels'
import { quarterTurns } from '../layout'
import type { EffectsLevel, Hand, ThemePref } from '../types'
import { COLOR_HEX } from '../theme'
import type { useGameView } from '../useGameView'

export type GameViewProps = {
  g: ReturnType<typeof useGameView>
  /** Whose yard is drawn at this device's corner. */
  viewer: Color
  /** The first person on this device ("You" on the board); none when only computers play. */
  you?: Color
  names: Partial<Record<Color, string>>
  animated: boolean
  rules: Rules
  quitLabel: string
  onQuit: () => void
  onRestart?: () => void
  onFinish: (game: GameState) => void
  hand: Hand
  onHand: (hand: Hand) => void
  theme: ThemePref
  onTheme: (theme: ThemePref) => void
  effectsLevel: EffectsLevel
  onEffectsLevel: (level: EffectsLevel) => void
  sound: boolean
  onSound: (on: boolean) => void
  music: boolean
  onMusic: (on: boolean) => void
}

const HAND_NAME: Record<Hand, string> = { right: 'Right', left: 'Left' }
export const THEME_NAME: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const EFFECTS_NAME: Record<EffectsLevel, string> = { full: 'Full', reduced: 'Reduced' }

/** A game's screen, from any controller: this device's, or a room's. */
export function GameView({ g, viewer, you, names, animated, rules, quitLabel, onQuit, onRestart, onFinish, hand, onHand, theme, onTheme, effectsLevel, onEffectsLevel, sound, onSound, music, onMusic }: GameViewProps) {
  const { game } = g
  // The destination being hovered or focused, so the tray can light up the rolls it would use.
  const [preview, setPreview] = useState<Move>()
  const [menuOpen, setMenuOpen] = useState(false)
  const dice = useRef<HTMLDivElement>(null)
  const play = useRef<HTMLDivElement>(null)
  const streak = useSixStreak(g.effects, game.turn)
  useGameAudio({ enabled: animated, streak: streak.count })
  useEffect(() => setPreview(undefined), [game])

  useEffect(() => {
    if (game.status !== 'finished' || g.moving) return
    // The last finish plays out on the board (the win's fireworks and confetti, its callout) before the results take over.
    const last = game.log.at(-1)
    const winner = game.players.find((p) => p.finishedPlace === 1)?.color
    const wonNow = last?.type === 'move' && last.move.piece.color === winner
    const delay = resultsDelay(animated, wonNow)
    if (delay === 0) return onFinish(game)
    const id = setTimeout(() => onFinish(game), delay)
    return () => clearTimeout(id)
  }, [game, g.moving])

  const mover = currentMover(game) ?? game.turn
  // The viewer never changes during a game, so neither does the turn of the board (only the hand preference can).
  const turn = quarterTurns(viewer, hand)
  const hint = g.humanToRoll
    ? 'Tap the dice to roll'
    : g.humanToMove
      ? g.movable.length > 1 && !g.selected
        ? 'Tap a numbered square, or a piece'
        : 'Tap a marked square'
      : ''
  // Only a person's own wasted roll is worth a word; a computer's is just noise.
  const noMove = g.wasted && g.controls(g.wasted.color) ? wastedText(g.wasted, viewer) : undefined

  return (
    // Effects are skipped when timing is instant (the browser tests' ?fast), so they never slow a game down.
    <FxLayer level={effectsLevel} enabled={animated}>
      <main className="game">
        <header className="topbar">
          <span className="title">Ludo Unlimited</span>
          <span className="rules-name">{rulesName(rules)}</span>
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
            names={names}
            you={you}
            active={game.status === 'playing' ? mover : undefined}
          >
            <KickCallout callout={g.callout} />
            <BoardFx effects={g.effects} state={game} turn={turn} area={play} />
          </Board>
          {/* Fixed heights throughout, so nothing jumps as the turn moves on. */}
          {/* On phones the dice sits under the playing hand's thumb. */}
          <section className="controls" aria-label="Dice" data-hand={hand}>
            <div className="dice-slot" ref={dice}>
              {/* Once the game is over it's nobody's turn; the space stays so nothing moves. */}
              <p className="turn-label" style={{ '--turn-color': COLOR_HEX[mover] } as CSSProperties}>
                {game.status === 'playing' && (
                  <>
                    <span className="turn-dot" aria-hidden="true" />
                    {turnTag(mover, viewer)}
                  </>
                )}
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
              <button type="button" className="sheet-row" aria-label={`Theme: ${THEME_NAME[theme]}`} onClick={() => onTheme(NEXT_THEME[theme])}>
                <span>Theme</span>
                <span className="row-value">{THEME_NAME[theme]}</span>
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
              {onRestart && (
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
              )}
              <button type="button" className="sheet-row" onClick={onQuit}>
                {quitLabel}
              </button>
            </div>
          </Sheet>
        )}
      </main>
    </FxLayer>
  )
}
