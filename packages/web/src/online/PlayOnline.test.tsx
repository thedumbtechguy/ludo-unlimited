import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayOnline } from './PlayOnline'

const renderPlay = (props: { name?: string; code?: string } = {}) => {
  const calls = { onName: vi.fn(), onCreate: vi.fn(), onJoin: vi.fn(), onBack: vi.fn() }
  render(<PlayOnline name={props.name ?? ''} code={props.code} {...calls} />)
  return calls
}
const nameField = () => screen.getByRole('textbox', { name: 'Your name' })
const codeField = () => screen.getByRole('textbox', { name: 'Room code' })

describe('PlayOnline', () => {
  it('needs a name before creating or joining', async () => {
    renderPlay({ code: 'ABCD' })
    expect(screen.getByRole('button', { name: 'Create a room' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled()
    await userEvent.type(nameField(), '   ')
    expect(screen.getByRole('button', { name: 'Create a room' })).toBeDisabled()
  })

  it('creates a room and saves the name, trimmed', async () => {
    const { onName, onCreate } = renderPlay()
    await userEvent.type(nameField(), ' Kofi ')
    await userEvent.click(screen.getByRole('button', { name: 'Create a room' }))
    expect(onName).toHaveBeenCalledWith('Kofi')
    expect(onCreate).toHaveBeenCalled()
  })

  it('takes four letters as the code, uppercased', async () => {
    renderPlay({ name: 'Ama' })
    await userEvent.type(codeField(), 'k7q-mz')
    expect(codeField()).toHaveValue('KQMZ')
  })

  it('joins once the code has four letters, and saves the name', async () => {
    const { onName, onJoin } = renderPlay({ name: 'Ama' })
    await userEvent.type(codeField(), 'kqm')
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled()
    await userEvent.type(codeField(), 'z')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(onName).toHaveBeenCalledWith('Ama')
    expect(onJoin).toHaveBeenCalledWith('KQMZ')
  })

  it('starts with a linked code filled in', () => {
    renderPlay({ code: 'ABCD' })
    expect(codeField()).toHaveValue('ABCD')
  })

  it('goes back', async () => {
    const { onBack } = renderPlay()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
  })
})
