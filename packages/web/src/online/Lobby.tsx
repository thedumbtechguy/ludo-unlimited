import { SEATS, type ClientMessage, type RoomView, type YouView } from '@ludo/engine'
import { useEffect, useState } from 'react'
import { Chevron } from '../components/Picker'
import { Sheet } from '../components/Sheet'
import { afterKickName, COLOR_NAME, endName, levelName, rulesName, timerName, whoCanJoinName } from '../labels'
import { COLOR_HEX } from '../theme'
import type { Status } from './socket'
import { useSecondsLeft } from './useSecondsLeft'

/** `startAt`: when a quick room starts by itself (a local time). */
type Props = {
  room: RoomView
  you: YouView
  status: Status
  send: (msg: ClientMessage) => void
  onSettings: () => void
  onLeave: () => void
  startAt?: number
}

const COPIED_MS = 2000

const roomLink = (code: string) => `${location.origin}/r/${code}`

/** The room before the game: share the code, take a seat, and the host starts. A quick room seats people and starts by itself. */
export function Lobby({ room, you, status, send, onSettings, onLeave, startAt }: Props) {
  const [asking, setAsking] = useState(false)
  // 'failed': no share sheet and no clipboard (plain http on a LAN, or permission denied), so show the link to copy by hand.
  const [shared, setShared] = useState<'copied' | 'failed'>()
  const offline = status !== 'open'
  const seats = SEATS[room.settings.players]
  const sitter = (color: string) => room.members.find((m) => m.seat === color)
  // As the room counts at the start: a seat whose player isn't connected is left out.
  const people = seats.filter((c) => sitter(c)?.connected).length
  const empty = seats.length - people
  const watching = room.members.filter((m) => !m.seat && m.connected).length
  const host = room.members.find((m) => m.id === room.host)
  const quick = room.open === 'quick'
  const seconds = useSecondsLeft(startAt)

  useEffect(() => {
    if (shared !== 'copied') return
    const timer = setTimeout(() => setShared(undefined), COPIED_MS)
    return () => clearTimeout(timer)
  }, [shared])

  async function share() {
    const url = roomLink(room.code)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Ludo Unlimited', text: `Join my Ludo game with code ${room.code}`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared('copied')
    } catch (e) {
      // Closing the share sheet is not a failure.
      if ((e as Error).name !== 'AbortError') setShared('failed')
    }
  }

  function start(empty: 'computers' | 'drop') {
    setAsking(false)
    send({ t: 'start', empty })
  }

  return (
    <main className="screen setup lobby">
      <header className="setup-head">
        <button type="button" className="icon-button" aria-label="Leave room" onClick={onLeave}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <h1>Room</h1>
      </header>
      {offline && (
        <p className="lobby-offline" role="status">
          Reconnecting…
        </p>
      )}

      <p className="room-code-label">Room code{room.open === 'hosted' && <span className="open-tag">Open</span>}</p>
      <p className="room-code">{room.code}</p>
      <button type="button" className="secondary" onClick={share}>
        {shared === 'copied' ? 'Link copied' : 'Share link'}
      </button>
      {shared === 'failed' && (
        <label className="field share-fallback">
          <span className="field-label">Couldn’t share. Copy this link, or tell friends the code.</span>
          <input readOnly value={roomLink(room.code)} onFocus={(e) => e.target.select()} />
        </label>
      )}

      <section aria-labelledby="seats-heading">
        <h2 id="seats-heading" className="section-heading">
          Players
        </h2>
        {seats.map((color) => {
          const m = sitter(color)
          return (
            <div key={color} className="row" data-testid="seat">
              <span className={m && !m.connected ? 'dot away' : 'dot'} style={{ background: COLOR_HEX[color] }} />
              <span className="row-label">
                {COLOR_NAME[color]}
                {m && `: ${m.name}${m.connected ? '' : ' (away)'}${m.id === room.host ? ' (host)' : ''}`}
              </span>
              {!quick &&
                (m?.id === you.id ? (
                  <button type="button" className="seat-button" disabled={offline} onClick={() => send({ t: 'stand' })}>
                    Stand up
                  </button>
                ) : (
                  !m &&
                  !you.seat && (
                    <button type="button" className="seat-button human" disabled={offline} aria-label={`Tap to sit as ${COLOR_NAME[color]}`} onClick={() => send({ t: 'sit', color })}>
                      Tap to sit
                    </button>
                  )
                ))}
            </div>
          )
        })}
        {watching > 0 && <p className="row-note lobby-watching">{watching} watching</p>}
      </section>

      <section aria-labelledby="settings-heading">
        <h2 id="settings-heading" className="section-heading">
          Settings
        </h2>
        <p className="row">
          <span className="row-label">Rules</span>
          <span className="row-value">{rulesName(room.settings.rules)}</span>
        </p>
        <p className="row">
          <span className="row-label">After a kick</span>
          <span className="row-value">{afterKickName(room.settings.afterKick)}</span>
        </p>
        <p className="row">
          <span className="row-label">Game ends</span>
          <span className="row-value">{endName(room.settings.endCondition)}</span>
        </p>
        {!quick && (
          <p className="row">
            <span className="row-label">Who can join</span>
            <span className="row-value">{whoCanJoinName(room.open === 'hosted')}</span>
          </p>
        )}
        <p className="row">
          <span className="row-label">Turn timer</span>
          <span className="row-value">{timerName(room.timer)}</span>
        </p>
        <p className="row">
          <span className="row-label">Computer level</span>
          <span className="row-value">{levelName(room.level)}</span>
        </p>
        {you.host && (
          <button type="button" className="row" disabled={offline} onClick={onSettings}>
            <span className="row-label">Change settings</span>
            <Chevron />
          </button>
        )}
      </section>

      {quick ? (
        <p className="lobby-waiting" aria-live="off">
          {seconds === undefined ? 'Waiting for players' : `Starting in ${seconds} s, computers fill empty seats`}
        </p>
      ) : you.host ? (
        <button type="button" className="primary start" disabled={people < 1 || offline} onClick={() => (empty === 0 ? start('computers') : setAsking(true))}>
          Start
        </button>
      ) : (
        <p className="lobby-waiting">Waiting for {host?.name ?? 'the host'} to start</p>
      )}

      {asking && (
        <Sheet title={`${empty} empty ${empty === 1 ? 'seat' : 'seats'}`} onClose={() => setAsking(false)}>
          <div className="sheet-rows">
            <button type="button" className="sheet-row" onClick={() => start('computers')}>
              Fill with computers
            </button>
            {people >= 2 && (
              <button type="button" className="sheet-row" onClick={() => start('drop')}>
                Play with {people}
              </button>
            )}
          </div>
        </Sheet>
      )}
    </main>
  )
}
