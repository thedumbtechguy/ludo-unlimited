import type { MemberView } from '@ludo/engine'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'

type Props = { members: MemberView[]; youId: number }

/** "2 watching" in the top bar while anyone without a seat is connected; a tap lists them. */
export function Watchers({ members, youId }: Props) {
  const [open, setOpen] = useState(false)
  const watchers = members.filter((m) => !m.seat && m.connected)
  if (watchers.length === 0) return null
  return (
    <>
      <button type="button" className="watching-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {watchers.length} watching
      </button>
      {open && (
        <Sheet title="Watching" onClose={() => setOpen(false)}>
          <ul className="watching-list">
            {watchers.map((m) => (
              <li key={m.id}>{m.id === youId ? `${m.name} (you)` : m.name}</li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  )
}
