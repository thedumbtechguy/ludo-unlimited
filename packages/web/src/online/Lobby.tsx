import { SEATS, type ClientMessage, type RoomView, type YouView } from '@ludo/engine'
import { useState } from 'react'
import { Chevron } from '../components/Picker'
import { Sheet } from '../components/Sheet'
import { COLOR_NAME, rulesName, timerName } from '../labels'
import { COLOR_HEX } from '../theme'

type Props = { room: RoomView; you: YouView; send: (msg: ClientMessage) => void; onSettings: () => void; onLeave: () => void }

const roomLink = (code: string) => `${location.origin}/r/${code}`

/** The room before the game: share the code, take a seat, and the host starts. */
export function Lobby({ room, you, send, onSettings, onLeave }: Props) {
  const [asking, setAsking] = useState(false)
  const [copied, setCopied] = useState(false)
  const seats = SEATS[room.settings.players]
  const sitter = (color: string) => room.members.find((m) => m.seat === color)
  const people = seats.filter(sitter).length
  const empty = seats.length - people
  const watching = room.members.filter((m) => !m.seat && m.connected).length
  const host = room.members.find((m) => m.id === room.host)

  async function share() {
    const url = roomLink(room.code)
    if (navigator.share) {
      // Closing the share sheet rejects; nothing to do.
      await navigator.share({ title: 'Ludo Unlimited', text: `Join my Ludo game with code ${room.code}`, url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
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

      <p className="room-code-label">Room code</p>
      <p className="room-code">{room.code}</p>
      <button type="button" className="secondary" onClick={share}>
        {copied ? 'Link copied' : 'Share link'}
      </button>

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
                {m && `: ${m.name}${m.id === room.host ? ' (host)' : ''}`}
              </span>
              {m?.id === you.id ? (
                <button type="button" className="seat-button" onClick={() => send({ t: 'stand' })}>
                  Stand up
                </button>
              ) : (
                !m &&
                !you.seat && (
                  <button type="button" className="seat-button human" aria-label={`Tap to sit as ${COLOR_NAME[color]}`} onClick={() => send({ t: 'sit', color })}>
                    Tap to sit
                  </button>
                )
              )}
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
          <span className="row-label">Turn timer</span>
          <span className="row-value">{timerName(room.timer)}</span>
        </p>
        {you.host && (
          <button type="button" className="row" onClick={onSettings}>
            <span className="row-label">Change settings</span>
            <Chevron />
          </button>
        )}
      </section>

      {you.host ? (
        <button type="button" className="primary start" disabled={people < 1} onClick={() => (empty === 0 ? start('computers') : setAsking(true))}>
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
