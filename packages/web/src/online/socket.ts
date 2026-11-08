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
/** Close codes the room uses when coming back won't help: no such room, old version, replaced by another tab. */
const FINAL_CODES = [4000, 4001]

/** A socket to the room that reconnects by itself, until `close()`. `send` is false while it's down. */
export function openConnection(o: {
  url: string
  onMessage: (msg: ServerMessage) => void
  onStatus: (status: Status) => void
  create?: (url: string) => SocketLike
}): Connection {
  const create = o.create ?? ((url: string) => new WebSocket(url) as unknown as SocketLike)
  let socket: SocketLike
  let wait = FIRST_WAIT
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function open() {
    socket = create(o.url)
    socket.onopen = () => {
      wait = FIRST_WAIT
      o.onStatus('open')
    }
    socket.onmessage = (e) => o.onMessage(JSON.parse(e.data) as ServerMessage)
    socket.onclose = (e) => {
      if (closed) return
      if (FINAL_CODES.includes(e.code)) {
        closed = true
        o.onStatus('closed')
        return
      }
      o.onStatus('reconnecting')
      timer = setTimeout(open, wait)
      wait = Math.min(wait * 2, LONGEST_WAIT)
    }
  }

  o.onStatus('connecting')
  open()
  return {
    send(msg) {
      if (socket.readyState !== 1) return false
      socket.send(JSON.stringify(msg))
      return true
    },
    close() {
      closed = true
      clearTimeout(timer)
      socket.close()
      o.onStatus('closed')
    },
  }
}
