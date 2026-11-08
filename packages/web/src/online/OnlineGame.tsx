import { SEATS, TIMER_SECONDS, type Color } from '@ludo/engine'
import { useState, type ReactNode } from 'react'
import { COLOR_NAME } from '../labels'
import { quarterTurns } from '../layout'
import { GameView, type GameViewProps } from '../screens/GameView'
import { OnlineResults } from './OnlineResults'
import { ReactionBubbles, ReactionButton } from './Reactions'
import { TurnClock } from './TurnClock'
import type { useOnlineGame } from './useOnlineGame'

/** This device's own settings, which stay the same in every game and room. */
export type DevicePrefs = Pick<GameViewProps, 'hand' | 'onHand' | 'theme' | 'onTheme' | 'effectsLevel' | 'onEffectsLevel' | 'sound' | 'onSound' | 'music' | 'onMusic'>

/** `animated`: false with instant timing (the browser tests' ?fast). */
type Props = DevicePrefs & { online: ReturnType<typeof useOnlineGame>; animated: boolean; onLeave: () => void }

/** A room's game: the usual game screen with names, the turn clock, reactions and the host's pause. */
export function OnlineGame({ online, animated, onLeave, ...prefs }: Props) {
  const { room, you, clock, game } = online
  // Shown once the last finish has played out on the board, as in a local game. A rematch takes the room back to the lobby, which unmounts this.
  const [results, setResults] = useState(false)
  if (!room || !you) return null

  const colors = game.players.map((p) => p.color)
  const nameOf = (color: Color) => (room.computers.includes(color) ? 'Computer' : (room.members.find((m) => m.seat === color)?.name ?? COLOR_NAME[color]))
  const names = Object.fromEntries(colors.map((c) => [c, nameOf(c)])) as Partial<Record<Color, string>>
  const away = colors.filter((c) => room.members.some((m) => m.seat === c && !m.connected))
  const viewer = you.seat ?? SEATS[room.settings.players][0]
  const host = you.host
  const left = clock.covering.find((c) => away.includes(c))
  const nobodyHere = !room.members.some((m) => m.seat && m.connected)
  const send = online.send

  if (results) {
    return (
      <OnlineResults
        game={game}
        names={names}
        host={host}
        hostName={room.members.find((m) => m.id === room.host)?.name}
        onRematch={() => send({ t: 'rematch' })}
        onLeave={onLeave}
      />
    )
  }

  // One notice at a time; a stale connection makes the others stale too.
  let notice: ReactNode
  if (online.status === 'reconnecting') notice = <Notice text="Reconnecting…" quiet />
  else if (clock.paused) {
    notice = (
      <Notice text={clock.pausedFor ? `Paused, waiting for ${nameOf(clock.pausedFor)}` : 'Paused'}>
        {host && (
          <button type="button" className="primary" onClick={() => send({ t: 'resume' })}>
            Carry on
          </button>
        )}
      </Notice>
    )
  } else if (nobodyHere && game.status === 'playing') {
    // The room doesn't play on with nobody seated, so nothing moves until someone is back.
    notice = <Notice text="Waiting for players to come back" />
  } else if (host && left) {
    notice = (
      <Notice text={`${nameOf(left)} left. A computer is playing for them`}>
        <button type="button" className="secondary" onClick={() => send({ t: 'pause', for: left })}>
          Pause and wait
        </button>
      </Notice>
    )
  }

  const total = room.timer === 'off' ? 0 : TIMER_SECONDS[room.timer] * 1000
  const ring = clock.deadline !== undefined && total > 0 && !clock.paused && game.status === 'playing' ? <TurnClock deadline={clock.deadline} total={total} /> : undefined

  return (
    <GameView
      {...prefs}
      g={online}
      viewer={viewer}
      you={you.seat}
      names={names}
      animated={animated}
      rules={room.settings.rules}
      quitLabel="Leave room"
      onQuit={onLeave}
      onFinish={() => setResults(true)}
      notice={notice}
      diceRing={ring}
      turnText={online.watching ? 'Watching' : undefined}
      turnNames={names}
      overlay={<ReactionBubbles reactions={online.reactions} turn={quarterTurns(viewer, prefs.hand)} names={names} />}
      side={you.seat && <ReactionButton onReact={(id) => send({ t: 'react', id })} />}
      away={away}
    />
  )
}

function Notice({ text, quiet, children }: { text: string; quiet?: boolean; children?: ReactNode }) {
  return (
    <div className={quiet ? 'notice quiet' : 'notice'} role="status">
      <span>{text}</span>
      {children}
    </div>
  )
}
