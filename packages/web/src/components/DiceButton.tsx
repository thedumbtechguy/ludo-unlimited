import { useState } from 'react'

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

// Rotation [x, y] in degrees that brings each face to the TOP, like a die resting on a table (faces are placed in styles.css).
// Always expressed as the same two functions so CSS interpolates function-by-function; a different
// function list between rolls makes the browser fall back to matrix interpolation, which drops the
// extra full turns and the spin never shows.
const FACE_UP: Record<number, [number, number]> = {
  3: [0, 0],
  4: [180, 0],
  1: [90, 0],
  6: [-90, 0],
  2: [90, -90],
  5: [90, 90],
}

// Where each face sits in the cube's own space (unit normal).
const NORMAL: Record<number, [number, number, number]> = {
  1: [0, 0, 1],
  6: [0, 0, -1],
  2: [1, 0, 0],
  5: [-1, 0, 0],
  3: [0, -1, 0],
  4: [0, 1, 0],
}

type Shade = 'front' | 'top' | 'side' | 'back'

// Light comes from above: which role does each face play once `facing` is on top?
function shadeOf(face: number, facing: number): Shade {
  const [ax, ay] = FACE_UP[facing].map((d) => (d * Math.PI) / 180)
  const [x, y, z] = NORMAL[face]
  // transform is rotateX(ax) rotateY(ay): rotate about Y first, then X.
  const x1 = x * Math.cos(ay) + z * Math.sin(ay)
  const z1 = -x * Math.sin(ay) + z * Math.cos(ay)
  const y2 = y * Math.cos(ax) - z1 * Math.sin(ax)
  const z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
  if (y2 < -0.5) return 'top'
  if (z2 > 0.5) return 'front'
  if (x1 < -0.5) return 'side'
  return 'back'
}

type Props = { value?: number; rolling?: boolean; target?: number; disabled: boolean; onRoll: () => void }

export function DiceButton({ value, rolling = false, target, disabled, onRoll }: Props) {
  // Accumulated full turns, so each roll keeps spinning forward.
  const [turns, setTurns] = useState({ x: 0, y: 0 })
  const [wasRolling, setWasRolling] = useState(false)

  // Bump the turns in the same render that flips `rolling`, so the spin and the result face change in one
  // style update (an effect would apply them a render apart and retarget the transition mid-flight).
  if (rolling !== wasRolling) {
    setWasRolling(rolling)
    if (rolling) {
      const extra = () => 2 + Math.floor(Math.random() * 2)
      setTurns((t) => ({ x: t.x + extra(), y: t.y + extra() }))
    }
  }

  const idle = value === undefined && !rolling
  const facing = (rolling ? target ?? value : value) ?? 6
  const [fx, fy] = FACE_UP[facing]
  const transform = `rotateX(${turns.x * 360}deg) rotateY(${turns.y * 360}deg) rotateX(${fx}deg) rotateY(${fy}deg)`

  return (
    <button
      type="button"
      className={rolling ? 'dice rolling' : 'dice'}
      disabled={disabled}
      onClick={onRoll}
      aria-label={value ? `Roll dice (last roll ${value})` : 'Roll dice'}
    >
      <span className="dice-view" aria-hidden="true">
        <span className="cube" style={{ transform }}>
          <span className="core core-a" />
          <span className="core core-b" />
          <span className="core core-c" />
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <span key={n} className={`face face-${n} shade-${shadeOf(n, facing)}`}>
              <span className="pips">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className={PIPS[n].includes(i) ? (idle ? 'pip on faded' : 'pip on') : 'pip'} />
                ))}
              </span>
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}
