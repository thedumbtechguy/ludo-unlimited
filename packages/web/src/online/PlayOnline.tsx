import { useState } from 'react'

type Props = { name: string; code?: string; onName: (name: string) => void; onCreate: () => void; onJoin: (code: string) => void; onBack: () => void }

/** Your nickname, then make a room or join one by its code. A linked code makes Join the main button. */
export function PlayOnline({ name: savedName, code: givenCode = '', onName, onCreate, onJoin, onBack }: Props) {
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState(givenCode)
  const clean = name.trim()
  const ready = clean.length > 0
  const keep = () => onName(clean)
  const linked = givenCode !== ''
  return (
    <main className="screen online">
      <header className="setup-head">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <h1>Play online</h1>
      </header>
      <label className="field">
        <span className="field-label">Your name</span>
        <input value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} onBlur={() => ready && keep()} />
      </label>
      <button type="button" className={linked ? 'secondary' : 'primary'} disabled={!ready} onClick={() => (keep(), onCreate())}>
        Create a room
      </button>
      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault()
          keep()
          onJoin(code)
        }}
      >
        <label className="field">
          <span className="field-label">Room code</span>
          <input
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
        </label>
        <button type="submit" className={linked ? 'primary' : 'secondary'} disabled={!ready || code.length !== 4}>
          Join
        </button>
      </form>
    </main>
  )
}
