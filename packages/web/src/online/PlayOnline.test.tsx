import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PlayOnline, type Step } from './PlayOnline'

type Calls = { onName: () => void; onCreate: () => void; onJoin: () => void; onBack: () => void }

// The app holds the step; here it just follows `onStep`.
function Steps({ name, code, calls }: { name: string; code?: string; calls: Calls }) {
  const [step, setStep] = useState<Step>(name && !code ? 'choice' : 'name')
  return <PlayOnline name={name} step={step} code={code} onStep={setStep} onNamed={() => setStep('choice')} {...calls} />
}

const renderPlay = (props: { name?: string; code?: string } = {}) => {
  const calls = { onName: vi.fn(), onCreate: vi.fn(), onJoin: vi.fn(), onBack: vi.fn() }
  render(<Steps name={props.name ?? ''} code={props.code} calls={calls} />)
  return calls
}
const nameField = () => screen.getByRole('textbox', { name: 'Your name' })
const codeField = () => screen.getByRole('textbox', { name: 'Room code' })
const button = (name: string) => screen.getByRole('button', { name })

describe('PlayOnline', () => {
  it('starts on the name step, and Next needs a name', async () => {
    renderPlay()
    expect(screen.getByRole('heading', { name: 'Play online' })).toBeInTheDocument()
    expect(button('Next')).toBeDisabled()
    await userEvent.type(nameField(), '   ')
    expect(button('Next')).toBeDisabled()
  })

  it('saves the name, trimmed, and moves to the choice', async () => {
    const { onName } = renderPlay()
    await userEvent.type(nameField(), ' Kofi ')
    await userEvent.click(button('Next'))
    expect(onName).toHaveBeenCalledWith('Kofi')
    expect(screen.getByRole('heading', { name: 'Play with friends' })).toBeInTheDocument()
    expect(screen.getByText(/Playing as Kofi/)).toBeInTheDocument()
  })

  it('starts on the choice with a saved name, and Create goes on', async () => {
    const { onCreate } = renderPlay({ name: 'Ama' })
    expect(screen.getByText(/Playing as Ama/)).toBeInTheDocument()
    await userEvent.click(button('Create a room'))
    expect(onCreate).toHaveBeenCalled()
  })

  it('Change goes back to the name, filled in', async () => {
    const { onName } = renderPlay({ name: 'Ama' })
    await userEvent.click(button('Change'))
    expect(nameField()).toHaveValue('Ama')
    await userEvent.clear(nameField())
    await userEvent.type(nameField(), 'Esi')
    await userEvent.click(button('Next'))
    expect(onName).toHaveBeenCalledWith('Esi')
    expect(screen.getByText(/Playing as Esi/)).toBeInTheDocument()
  })

  it('joins by a code of four letters, uppercased', async () => {
    const { onJoin } = renderPlay({ name: 'Ama' })
    await userEvent.click(button('Join a room'))
    expect(screen.getByRole('heading', { name: 'Join a room' })).toBeInTheDocument()
    expect(codeField()).toHaveFocus()
    await userEvent.type(codeField(), 'k7q-m')
    expect(codeField()).toHaveValue('KQM')
    expect(button('Join')).toBeDisabled()
    await userEvent.type(codeField(), 'z')
    expect(codeField()).toHaveValue('KQMZ')
    await userEvent.click(button('Join'))
    expect(onJoin).toHaveBeenCalledWith('KQMZ')
  })

  it('leaves going back to the app, on every step', async () => {
    const { onBack } = renderPlay({ name: 'Ama' })
    await userEvent.click(button('Back'))
    await userEvent.click(button('Join a room'))
    await userEvent.click(button('Back'))
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('on a room link, Next joins that room', async () => {
    const { onName, onJoin } = renderPlay({ code: 'ABCD' })
    await userEvent.type(nameField(), 'Kofi')
    await userEvent.click(button('Next'))
    expect(onName).toHaveBeenCalledWith('Kofi')
    expect(onJoin).toHaveBeenCalledWith('ABCD')
  })
})
