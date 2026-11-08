const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function DiceButton({ value, disabled, onRoll }: { value?: number; disabled: boolean; onRoll: () => void }) {
  return (
    <button
      type="button"
      className="dice"
      disabled={disabled}
      onClick={onRoll}
      aria-label={value ? `Roll dice (last roll ${value})` : 'Roll dice'}
    >
      <span className="pips" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={value && PIPS[value].includes(i) ? 'pip on' : 'pip'} />
        ))}
      </span>
    </button>
  )
}
