import type { ModeName } from '@ludo/engine'
import { useState } from 'react'
import { Chevron, Picker } from '../components/Picker'
import { QUICK_MODES } from '../labels'

type Props = { mode: ModeName; onMode: (mode: ModeName) => void; busy: boolean; error?: string; onGo: () => void; onCancel: () => void; onBack: () => void }

/** Pick the rules, and the app finds a game: one with people waiting, or a new one. */
export function QuickMatch({ mode, onMode, busy, error, onGo, onCancel, onBack }: Props) {
  const [picking, setPicking] = useState(false)
  return (
    <main className="screen setup quick-match">
      <header className="setup-head">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <h1>Quick match</h1>
      </header>
      {busy ? (
        <>
          <p className="quick-finding" role="status">
            Finding a game…
          </p>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" className="row" aria-haspopup="dialog" onClick={() => setPicking(true)}>
            <span className="row-label">Rules</span>
            <span className="row-value">{QUICK_MODES.find(([m]) => m === mode)![1]}</span>
            <Chevron />
          </button>
          <p className="row-note setup-note">4 players, 30 s turns. Computers fill seats until people join.</p>
          {error && (
            <p role="alert" className="setup-error">
              {error}
            </p>
          )}
          <button type="button" className="primary start" onClick={onGo}>
            {error ? 'Try again' : 'Go'}
          </button>
        </>
      )}
      {picking && <Picker title="Rules" options={QUICK_MODES} value={mode} onPick={onMode} onClose={() => setPicking(false)} />}
    </main>
  )
}
