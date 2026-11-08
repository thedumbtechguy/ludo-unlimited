import { afterEach, describe, expect, it, vi } from 'vitest'
import { openConnection, type SocketLike } from './socket'

class FakeSocket implements SocketLike {
  static made: FakeSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  constructor() {
    FakeSocket.made.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close(code = 1000) {
    this.readyState = 3
    this.onclose?.({ code })
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
}

/** The socket opens on the next microtask. */
const opened = () => Promise.resolve()

describe('openConnection', () => {
  afterEach(() => {
    vi.useRealTimers()
    FakeSocket.made = []
  })

  it('passes messages both ways once open', async () => {
    const onMessage = vi.fn()
    const conn = openConnection({ url: () => 'ws://x', onMessage, onStatus: vi.fn(), create: () => new FakeSocket() })
    await opened()
    const socket = FakeSocket.made[0]
    expect(conn.send({ t: 'roll' })).toBe(false) // not open yet
    socket.open()
    expect(conn.send({ t: 'roll' })).toBe(true)
    expect(socket.sent).toEqual(['{"t":"roll"}'])
    socket.onmessage?.({ data: '{"t":"error","code":"illegal"}' })
    expect(onMessage).toHaveBeenCalledWith({ t: 'error', code: 'illegal' })
  })

  it('reconnects with a growing wait, and stops for good on close()', async () => {
    vi.useFakeTimers()
    const onStatus = vi.fn()
    const conn = openConnection({ url: () => 'ws://x', onMessage: vi.fn(), onStatus, create: () => new FakeSocket() })
    await opened()
    FakeSocket.made[0].close()
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')
    vi.advanceTimersByTime(499)
    expect(FakeSocket.made).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.made).toHaveLength(2)
    FakeSocket.made[1].close()
    vi.advanceTimersByTime(999)
    expect(FakeSocket.made).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.made).toHaveLength(3)
    conn.close()
    vi.advanceTimersByTime(10_000)
    expect(FakeSocket.made).toHaveLength(3)
    expect(onStatus).toHaveBeenLastCalledWith('closed')
  })

  it('caps the wait at 8 s and starts over once open', async () => {
    vi.useFakeTimers()
    openConnection({ url: () => 'ws://x', onMessage: vi.fn(), onStatus: vi.fn(), create: () => new FakeSocket() })
    await opened()
    for (const wait of [500, 1000, 2000, 4000, 8000, 8000]) {
      const count = FakeSocket.made.length
      FakeSocket.made[count - 1].close()
      vi.advanceTimersByTime(wait - 1)
      expect(FakeSocket.made).toHaveLength(count)
      vi.advanceTimersByTime(1)
      expect(FakeSocket.made).toHaveLength(count + 1)
    }
    const last = FakeSocket.made[FakeSocket.made.length - 1]
    last.open()
    last.close()
    vi.advanceTimersByTime(500)
    expect(FakeSocket.made).toHaveLength(8)
  })

  it('builds the URL afresh on each reconnect', async () => {
    vi.useFakeTimers()
    const urls: string[] = []
    let name = 'Ama'
    openConnection({
      url: () => `ws://x?name=${name}`,
      onMessage: vi.fn(),
      onStatus: vi.fn(),
      create: (url) => {
        urls.push(url)
        return new FakeSocket()
      },
    })
    await opened()
    name = 'Kofi'
    FakeSocket.made[0].close()
    vi.advanceTimersByTime(500)
    expect(urls).toEqual(['ws://x?name=Ama', 'ws://x?name=Kofi'])
  })

  it("a connection closed straight away never opens a socket, as with React's dev double effects", async () => {
    const onStatus = vi.fn()
    openConnection({ url: () => 'ws://x', onMessage: vi.fn(), onStatus, create: () => new FakeSocket() }).close()
    await opened()
    expect(FakeSocket.made).toHaveLength(0)
    expect(onStatus).toHaveBeenLastCalledWith('closed')
  })

  it.each([4000, 4001])('does not reconnect when the room closes it with %i', async (code) => {
    vi.useFakeTimers()
    const onStatus = vi.fn()
    openConnection({ url: () => 'ws://x', onMessage: vi.fn(), onStatus, create: () => new FakeSocket() })
    await opened()
    FakeSocket.made[0].open()
    FakeSocket.made[0].close(code)
    vi.advanceTimersByTime(10_000)
    expect(FakeSocket.made).toHaveLength(1)
    expect(onStatus).toHaveBeenLastCalledWith('closed')
  })
})
