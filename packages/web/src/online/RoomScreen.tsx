import { useEffect, useState } from 'react'
import { Setup } from '../screens/Setup'
import { updateNow } from '../update'
import type { Timing } from '../useGame'
import { Lobby } from './Lobby'
import { OnlineGame, type DevicePrefs } from './OnlineGame'
import { useOnlineGame } from './useOnlineGame'

type Props = { code: string; device: string; name: string; timing: Timing; onLeave: () => void; prefs: DevicePrefs }

/** A room, from the lobby to the game. It holds the connection: leaving the screen closes it. */
export function RoomScreen({ code, device, name, timing, onLeave, prefs }: Props) {
  const online = useOnlineGame({ code, device, name, timing })
  const [editing, setEditing] = useState(false)
  const { room, you, error } = online
  // False once an update was tried for this room and the app is still too old.
  const [updating, setUpdating] = useState(true)
  useEffect(() => {
    if (error === 'old_version') setUpdating(updateNow(code))
  }, [error, code])

  if (error === 'old_version') return <Message text={updating ? 'Updating to keep playing…' : 'Update the app to keep playing. Close it and open it again.'} onHome={onLeave} />
  if (error === 'not_found') return <Message text={room ? 'This room has ended' : 'No room with that code'} onHome={onLeave} />
  if (error === 'replaced') return <Message text="This room is open in another tab" onHome={onLeave} />
  if (!room || !you) return <Message text="Connecting…" onHome={onLeave} />

  if (room.phase === 'lobby') {
    if (editing && you.host) {
      return (
        <Setup
          {...prefs}
          onBack={() => setEditing(false)}
          onStart={() => {}}
          online={{
            initial: { settings: room.settings, timer: room.timer },
            submitLabel: 'Save',
            onCreate: (settings, timer) => {
              online.send({ t: 'settings', settings, timer })
              setEditing(false)
            },
          }}
        />
      )
    }
    return <Lobby room={room} you={you} status={online.status} send={online.send} onSettings={() => setEditing(true)} onLeave={onLeave} />
  }
  return <OnlineGame {...prefs} online={online} animated={timing.step > 0} onLeave={onLeave} />
}

function Message({ text, onHome }: { text: string; onHome?: () => void }) {
  return (
    <main className="screen message">
      <p role="status">{text}</p>
      {onHome && (
        <button type="button" className="primary" onClick={onHome}>
          Home
        </button>
      )}
    </main>
  )
}
