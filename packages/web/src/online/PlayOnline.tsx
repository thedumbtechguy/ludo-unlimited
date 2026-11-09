import { useState } from 'react'

export type Step = 'name' | 'choice' | 'code'
type Props = {
  name: string
  step: Step
  code?: string
  onName: (name: string) => void
  onStep: (step: Step) => void
  onNamed: () => void
  onCreate: () => void
  onJoin: (code: string) => void
  onBack: () => void
}

/** Play online in steps: your name, then make a room or join one, then its details. A room link skips the choice and goes straight in. */
export function PlayOnline({ name: savedName, step, code: linked, onName, onStep, onNamed, onCreate, onJoin, onBack }: Props) {
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState('')
  const clean = name.trim()
  const header = (
    <header className="setup-head">
      <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4l-6 6 6 6" />
        </svg>
      </button>
      <h1>{step === 'code' ? 'Join a room' : step === 'choice' ? 'Play with friends' : 'Play online'}</h1>
    </header>
  )

  if (step === 'name') {
    return (
      <main className="screen online">
        {header}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!clean) return
            onName(clean)
            if (linked) onJoin(linked)
            else onNamed()
          }}
        >
          <label className="field">
            <span className="field-label">Your name</span>
            <input value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="primary" disabled={!clean}>
            Next
          </button>
        </form>
      </main>
    )
  }

  if (step === 'choice') {
    return (
      <main className="screen online">
        {header}
        <p className="playing-as">
          Playing as {clean}
          <button type="button" className="text-button" onClick={() => onStep('name')}>
            Change
          </button>
        </p>
        <button type="button" className="primary" onClick={onCreate}>
          Create a room
        </button>
        <button type="button" className="secondary" onClick={() => onStep('code')}>
          Join a room
        </button>
      </main>
    )
  }

  return (
    <main className="screen online">
      {header}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length === 4) onJoin(code)
        }}
      >
        <label className="field join">
          <span className="field-label">Room code</span>
          <input
            value={code}
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
        </label>
        <button type="submit" className="primary" disabled={code.length !== 4}>
          Join
        </button>
      </form>
    </main>
  )
}
