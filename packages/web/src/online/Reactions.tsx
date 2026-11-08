import type { Color, Reaction } from '@ludo/engine'
import { useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { yardCentre } from '../fx/actions'
import { BOARD_SIZE, turnPoint } from '../layout'
import type { ShownReaction } from './useOnlineGame'

export const REACTION_TEXT: Record<Reaction, string> = { laugh: '😂', clap: '👏', shock: '😱', fire: '🔥', hurry: 'Hurry up', wicked: 'Wicked!' }

/** The room takes one reaction per 3 seconds from each player. */
const REACT_GAP = 3000

export function ReactionButton({ onReact }: { onReact: (id: Reaction) => void }) {
  const [open, setOpen] = useState(false)
  const [resting, setResting] = useState(false)
  useEffect(() => {
    if (!resting) return
    const timer = setTimeout(() => setResting(false), REACT_GAP)
    return () => clearTimeout(timer)
  }, [resting])
  return (
    <>
      <button type="button" className="menu-button react-button"
        aria-label="React"
        aria-haspopup="dialog"
        title={resting ? 'Wait a moment to react again' : undefined}
        disabled={resting}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M6.7 11.8a3.8 3.8 0 0 0 6.6 0" />
          <path d="M7.3 7.8v.4M12.7 7.8v.4" strokeWidth="2.4" />
        </svg>
        <span aria-hidden="true">React</span>
      </button>
      {open && (
        <Sheet title="React" onClose={() => setOpen(false)}>
          <div className="reaction-grid">
            {(Object.keys(REACTION_TEXT) as Reaction[]).map((id) => (
              <button
                key={id}
                type="button"
                className="reaction-choice"
                onClick={() => {
                  onReact(id)
                  setOpen(false)
                  setResting(true)
                }}
              >
                {REACTION_TEXT[id]}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

const pct = (v: number) => `${(v / BOARD_SIZE) * 100}%`

type BubblesProps = { reactions: ShownReaction[]; turn: number; names: Partial<Record<Color, string>> }

/** Each reaction pops over its sender's yard, wherever the board is turned. */
export function ReactionBubbles({ reactions, turn, names }: BubblesProps) {
  return (
    <>
      {reactions.map((r) => {
        const { x, y } = turnPoint(yardCentre(r.color), turn)
        return (
          <span
            key={r.id}
            className="reaction-bubble"
            style={{ left: pct(x), top: pct(y) }}
            role="status"
            aria-label={`${names[r.color]}: ${REACTION_TEXT[r.reaction]}`}
          >
            {REACTION_TEXT[r.reaction]}
          </span>
        )
      })}
    </>
  )
}
