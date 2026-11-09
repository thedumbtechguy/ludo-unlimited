import type { Listing } from '@ludo/engine'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Chevron } from '../components/Picker'
import { LISTED_MODE_NAME, listingStatus, timerName } from '../labels'
import { openRooms } from './api'

const REFRESH_MS = 5000

type Props = { load?: () => Promise<Listing[]>; onOpen: (code: string) => void; onQuick: () => void; onBack: () => void }

/** The open rooms someone could play in, kept fresh while on screen. */
export function FindGame({ load = openRooms, onOpen, onQuick, onBack }: Props) {
  const [rooms, setRooms] = useState<Listing[]>()
  const [failed, setFailed] = useState(false)
  // Only the latest answer counts, and none after leaving.
  const latest = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++latest.current
    try {
      const next = await load()
      if (request !== latest.current) return
      setRooms(next)
      setFailed(false)
    } catch {
      if (request === latest.current) setFailed(true)
    }
  }, [load])

  useEffect(() => {
    void refresh()
    const visible = () => document.visibilityState === 'visible'
    const timer = setInterval(() => visible() && void refresh(), REFRESH_MS)
    const onVisible = () => visible() && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      latest.current += 1
    }
  }, [refresh])

  return (
    <main className="screen setup find-game">
      <header className="setup-head">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <h1>Find a game</h1>
      </header>
      {failed && (
        <div className="find-problem" role="alert">
          <p>Couldn’t load games</p>
          <button type="button" className="secondary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}
      {!rooms && !failed && <p role="status">Looking for games…</p>}
      {rooms?.length === 0 && (
        <>
          <p className="find-empty">No open games right now</p>
          <button type="button" className="primary" onClick={onQuick}>
            Quick match
          </button>
        </>
      )}
      {rooms && rooms.length > 0 && (
        <>
          {rooms.map((l) => (
            <button key={l.code} type="button" className="row" data-testid="listing" onClick={() => onOpen(l.code)}>
              <span className="row-text">
                <span>
                  {LISTED_MODE_NAME[l.mode]} · {l.kind === 'quick' ? 'Quick' : `${l.host ?? 'Someone'}’s room`}
                </span>
                <span className="row-note">
                  {listingStatus(l)} · {timerName(l.timer)}
                </span>
              </span>
              <Chevron />
            </button>
          ))}
          <button type="button" className="text-button find-refresh" onClick={() => void refresh()}>
            Refresh
          </button>
        </>
      )}
    </main>
  )
}
