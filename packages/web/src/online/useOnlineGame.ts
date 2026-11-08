import { createGame, replay, settingsFor, type ClientMessage, type Color, type ErrorCode, type Reaction, type RoomView, type ServerMessage, type Timing, type YouView } from '@ludo/engine'
import { useEffect, useRef, useState } from 'react'
import { useGameView } from '../useGameView'
import { socketUrl } from './api'
import { openConnection, type Connection, type Status } from './socket'

export type Clock = { deadline?: number; paused: boolean; pausedFor?: Color; covering: Color[] }
export type ShownReaction = { id: number; color: Color; reaction: Reaction }

/** Errors after which there's no point reconnecting. */
const FINAL: ErrorCode[] = ['not_found', 'old_version', 'replaced']
const REACTION_MS = 2000

export type OnlineOptions = {
  code: string
  device: string
  name: string
  timing: Timing
  connect?: typeof openConnection
}

const clockFrom = (deadlineIn: number | undefined, rest: Omit<Clock, 'deadline'>): Clock => ({
  ...rest,
  deadline: deadlineIn === undefined ? undefined : Date.now() + deadlineIn,
})

/** A game in an online room: the room plays it, this device shows it and sends what its person does. */
export function useOnlineGame({ code, device, name, timing, connect = openConnection }: OnlineOptions) {
  const [room, setRoom] = useState<RoomView>()
  const [you, setYou] = useState<YouView>()
  const [status, setStatus] = useState<Status>('connecting')
  const [error, setError] = useState<ErrorCode>()
  const [clock, setClock] = useState<Clock>({ paused: false, covering: [] })
  const [reactions, setReactions] = useState<ShownReaction[]>([])
  // Sent an action, no answer yet: nothing more to send until there is.
  const [waiting, setWaiting] = useState(false)
  // The last event shown. Counts across rematches, so it's never the log's length.
  const seq = useRef(0)
  // Whether the board shows the room's game. Starting it doesn't move seq, so seq alone can't tell.
  const live = useRef(false)
  // A sync is on its way: one is enough until the room answers.
  const syncing = useRef(false)
  const reactionTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const latestName = useRef(name)
  latestName.current = name
  const conn = useRef<Connection>()
  const reactionId = useRef(0)
  const seat = you?.seat

  const view = useGameView({
    initial: createGame(settingsFor('ghana', 4, 'firstWins')),
    timing,
    you: seat,
    controls: (color) => color === seat && !waiting && !clock.paused && !clock.covering.includes(color),
    act: (intent) => {
      if (conn.current?.send(intent)) setWaiting(true)
    },
  })

  function handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'room': {
        const r = msg.room
        syncing.current = false
        setRoom(r)
        setYou(msg.you)
        setWaiting(false)
        setClock(clockFrom(r.deadlineIn, { paused: r.paused, pausedFor: r.pausedFor, covering: r.covering }))
        if (r.phase === 'lobby') {
          live.current = false
          seq.current = r.seq
          view.reset(createGame(r.settings))
        } else if (!live.current || r.seq !== seq.current) {
          // New to the game, or out of step with it: start over from its log. Otherwise keep animating.
          live.current = true
          seq.current = r.seq
          view.reset(replay(r.settings, r.log))
        }
        return
      }
      case 'event':
        if (msg.seq !== seq.current + 1) {
          if (!syncing.current) syncing.current = conn.current?.send({ t: 'sync' }) ?? false
          return
        }
        seq.current = msg.seq
        setWaiting(false)
        view.enqueue(msg.event)
        return
      case 'clock':
        setClock(clockFrom(msg.deadlineIn, { paused: msg.paused, pausedFor: msg.pausedFor, covering: msg.covering }))
        return
      case 'reaction': {
        const id = ++reactionId.current
        setReactions((all) => [...all, { id, color: msg.color, reaction: msg.id }])
        const timer = setTimeout(() => {
          reactionTimers.current.delete(timer)
          setReactions((all) => all.filter((r) => r.id !== id))
        }, REACTION_MS)
        reactionTimers.current.add(timer)
        return
      }
      case 'error':
        setWaiting(false)
        if (FINAL.includes(msg.code)) {
          setError(msg.code)
          conn.current?.close()
        }
        return
    }
  }
  // The socket is opened once; its messages always reach the latest handler.
  const handler = useRef(handle)
  handler.current = handle

  useEffect(() => {
    const c = connect({ url: () => socketUrl(code, device, latestName.current), onMessage: (m) => handler.current(m), onStatus: setStatus })
    conn.current = c
    const timers = reactionTimers.current
    return () => {
      c.close()
      timers.forEach(clearTimeout)
    }
  }, [code, device])

  const send = (msg: ClientMessage) => conn.current?.send(msg) ?? false

  return { ...view, room, you, status, error, clock, reactions, send, watching: you !== undefined && !you.seat }
}
