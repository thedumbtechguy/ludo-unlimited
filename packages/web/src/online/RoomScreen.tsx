import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { Setup } from '../screens/Setup'
import { updateNow } from '../update'
import type { Timing } from '../useGame'
import { Lobby } from './Lobby'
import { OnlineGame, type DevicePrefs } from './OnlineGame'
import { useOnlineGame } from './useOnlineGame'

const UPDATE_WAIT = 8000

/** `onNoSeat`: a quick match landed here, but the room had no seat for you. */
type Props = { code: string; device: string; name: string; timing: Timing; onLeave: () => void; onNoSeat?: () => void; prefs: DevicePrefs }

/** A room, from the lobby to the game. It holds the connection: leaving the screen closes it. */
export function RoomScreen(props: Props) {
  return (
    <RoomBoundary code={props.code} onHome={props.onLeave}>
      <Room {...props} />
    </RoomBoundary>
  )
}

/** Anything in the room's screens that throws ends up here, said plainly, rather than a blank page. */
class RoomBoundary extends Component<{ code: string; onHome: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(`room ${this.props.code}: the screen failed`, error)
  }
  render() {
    return this.state.failed ? <Problem code={this.props.code} onHome={this.props.onHome} /> : this.props.children
  }
}

const Problem = ({ code, onHome }: { code: string; onHome: () => void }) => (
  <Message text="This room ran into a problem and can't continue." detail={`Room ${code}`} onHome={onHome} />
)

function Room({ code, device, name, timing, onLeave, onNoSeat, prefs }: Props) {
  const online = useOnlineGame({ code, device, name, timing })
  const [editing, setEditing] = useState(false)
  const { room, you, error } = online
  // A quick match lands you on a seat; if the first word from the room has none for you, the seat was lost.
  const judged = useRef(false)
  useEffect(() => {
    if (judged.current || !room || !you) return
    judged.current = true
    if (onNoSeat && room.open === 'quick' && !you.seat) onNoSeat()
  }, [room, you, onNoSeat])
  // False once an update was tried for this room and the app is still too old.
  const [updating, setUpdating] = useState(true)
  useEffect(() => {
    if (error === 'old_version') setUpdating(updateNow(code))
  }, [error, code])
  // No new version came (offline, or none to get yet): say so rather than wait forever.
  useEffect(() => {
    if (error !== 'old_version' || !updating) return
    const timer = setTimeout(() => setUpdating(false), UPDATE_WAIT)
    return () => clearTimeout(timer)
  }, [error, updating])

  if (error === 'old_version') return <Message text={updating ? 'Updating to keep playing…' : 'Update the app to keep playing. Close it and open it again.'} onHome={onLeave} />
  if (error === 'not_found') return <Message text={room ? 'This room has ended' : 'No room with that code'} onHome={onLeave} />
  if (error === 'broken') return <Problem code={code} onHome={onLeave} />
  if (error === 'replaced') return <Message text="This room is open in another tab" onHome={onLeave} />
  if (!room || !you) return <Message text="Connecting…" onHome={onLeave} />

  if (room.phase === 'lobby') {
    if (editing && you.host) {
      return (
        <Setup
          {...prefs}
          onBack={() => setEditing(false)}
          online={{
            initial: { settings: room.settings, timer: room.timer, level: room.level, open: room.open === 'hosted' },
            submitLabel: 'Save',
            onCreate: (settings, timer, level, open) => {
              online.send({ t: 'settings', settings, timer, level, open })
              setEditing(false)
            },
          }}
        />
      )
    }
    return <Lobby room={room} you={you} status={online.status} send={online.send} onSettings={() => setEditing(true)} onLeave={onLeave} startAt={online.clock.startAt} />
  }
  return <OnlineGame {...prefs} online={online} animated={timing.step > 0} onLeave={onLeave} />
}

function Message({ text, detail, onHome }: { text: string; detail?: string; onHome?: () => void }) {
  return (
    <main className="screen message">
      <p role="status">{text}</p>
      {detail && <p className="detail">{detail}</p>}
      {onHome && (
        <button type="button" className="primary" onClick={onHome}>
          Home
        </button>
      )}
    </main>
  )
}
