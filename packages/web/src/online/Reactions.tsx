import type { Reaction } from '@ludo/engine'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { yardCentre } from '../fx/actions'
import { BOARD_SIZE, turnPoint } from '../layout'
import type { ShownReaction } from './useOnlineGame'

export const REACTION_TEXT: Record<Reaction, string> = { laugh: '😂', clap: '👏', shock: '😱', fire: '🔥', hurry: 'Hurry up', wicked: 'Wicked!' }

export function ReactionButton({ onReact }: { onReact: (id: Reaction) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="secondary react-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        React
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

/** Each reaction pops over its sender's yard, wherever the board is turned. */
export function ReactionBubbles({ reactions, turn }: { reactions: ShownReaction[]; turn: number }) {
  return (
    <>
      {reactions.map((r) => {
        const { x, y } = turnPoint(yardCentre(r.color), turn)
        return (
          <span key={r.id} className="reaction-bubble" style={{ left: pct(x), top: pct(y) }} role="status">
            {REACTION_TEXT[r.reaction]}
          </span>
        )
      })}
    </>
  )
}
