import { useEffect, useState } from 'react'

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

// Rotation that brings each face to the viewer (faces are placed in styles.css).
const FACE_UP: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  6: 'rotateY(180deg)',
  2: 'rotateY(-90deg)',
  5: 'rotateY(90deg)',
  3: 'rotateX(-90deg)',
  4: 'rotateX(90deg)',
}

const REST_TILT = 'rotateX(-20deg) rotateY(25deg)'
const SETTLED_TILT = 'rotateX(-12deg) rotateY(14deg)'

type Props = { value?: number; rolling?: boolean; target?: number; disabled: boolean; onRoll: () => void }

export function DiceButton({ value, rolling = false, target, disabled, onRoll }: Props) {
  // Accumulated full turns, so each roll keeps spinning forward.
  const [turns, setTurns] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!rolling) return
    const extra = () => 2 + Math.floor(Math.random() * 2)
    setTurns((t) => ({ x: t.x + extra(), y: t.y + extra() }))
  }, [rolling])

  const idle = value === undefined && !rolling
  const facing = (rolling ? target ?? value : value) ?? 6
  const transform = `${idle ? REST_TILT : SETTLED_TILT} rotateX(${turns.x * 360}deg) rotateY(${turns.y * 360}deg) ${FACE_UP[facing]}`

  return (
    <button
      type="button"
      className={rolling ? 'dice rolling' : 'dice'}
      disabled={disabled}
      onClick={onRoll}
      aria-label={value ? `Roll dice (last roll ${value})` : 'Roll dice'}
    >
      <span className="cube" style={{ transform }} aria-hidden="true">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <span key={n} className={`face face-${n}`}>
            <span className="pips">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className={PIPS[n].includes(i) ? (idle ? 'pip on faded' : 'pip on') : 'pip'} />
              ))}
            </span>
          </span>
        ))}
      </span>
    </button>
  )
}
