import type { ClientMessage, ServerMessage } from '@ludo/engine'

export type SocketLike = {
  readyState: number
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((e: { data: string }) => void) | null
  onclose: ((e: { code: number }) => void) | null
}

export type Status = 'connecting' | 'open' | 'reconnecting' | 'closed'
export type Connection = { send(msg: ClientMessage): boolean; close(): void }

const FIRST_WAIT = 500
const LONGEST_WAIT = 8000
/** A socket can die without closing (a phone changing networks); a ping that gets no pong finds it. */
const PING_EVERY = 20_000
const PONG_WITHIN = 10_000
/** Close codes the room uses when coming back won't help: no such room, old version, replaced by another tab. */
const FINAL_CODES = [4000, 4001]

/**
 * A socket to the room that reconnects by itself, until `close()`. `send` is false while it's down.
 * `url` is asked afresh on each attempt, so a reconnect carries the latest name.
 */
export function openConnection(o: {
  url: () => string
  onMessage: (msg: ServerMessage) => void
  onStatus: (status: Status) => void
  create?: (url: string) => SocketLike
}): Connection {
  const create = o.create ?? ((url: string) => new WebSocket(url) as unknown as SocketLike)
  let current: SocketLike | undefined
  let wait = FIRST_WAIT
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pinging: ReturnType<typeof setInterval> | undefined
  let pong: ReturnType<typeof setTimeout> | undefined

  function stopPinging() {
    clearInterval(pinging)
    clearTimeout(pong)
    pinging = pong = undefined
  }

  function ping() {
    const socket = current
    if (socket?.readyState !== 1 || pong !== undefined) return
    socket.send('ping')
    pong = setTimeout(() => dead(socket), PONG_WITHIN)
  }

  /** Give up on a socket that stopped answering: its close may never come, so don't wait for it. */
  function dead(socket: SocketLike) {
    socket.onclose = socket.onmessage = null
    stopPinging()
    socket.close()
    retry()
  }

  function retry() {
    o.onStatus('reconnecting')
    timer = setTimeout(open, wait)
    wait = Math.min(wait * 2, LONGEST_WAIT)
  }

  function open() {
    if (closed) return
    const socket = create(o.url())
    current = socket
    socket.onopen = () => {
      wait = FIRST_WAIT
      o.onStatus('open')
      pinging = setInterval(ping, PING_EVERY)
    }
    socket.onmessage = (e) => {
      if (e.data === 'pong') {
        clearTimeout(pong)
        pong = undefined
        return
      }
      o.onMessage(JSON.parse(e.data) as ServerMessage)
    }
    socket.onclose = (e) => {
      stopPinging()
      if (closed) return
      if (FINAL_CODES.includes(e.code)) {
        closed = true
        o.onStatus('closed')
        return
      }
      retry()
    }
  }

  // Back from another app: check the socket at once rather than at the next ping.
  const onVisible = () => {
    if (document.visibilityState === 'visible') ping()
  }
  document.addEventListener('visibilitychange', onVisible)

  o.onStatus('connecting')
  // On the next microtask, so a connection closed straight away (React's dev double effects) never reaches the room.
  queueMicrotask(open)
  return {
    send(msg) {
      if (current?.readyState !== 1) return false
      current.send(JSON.stringify(msg))
      return true
    },
    close() {
      closed = true
      clearTimeout(timer)
      stopPinging()
      document.removeEventListener('visibilitychange', onVisible)
      current?.close()
      o.onStatus('closed')
    },
  }
}
