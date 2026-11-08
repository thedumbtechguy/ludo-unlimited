import { useId } from 'react'
import { Sheet } from './Sheet'

type Props<T extends string | number> = {
  title: string
  /** Each option's value, label and, optionally, a line under the label saying what it does. */
  options: readonly (readonly [T, string, string?])[]
  value: T
  onPick: (value: T) => void
  onClose: () => void
}

/** A bottom sheet of options with a checkmark on the current one. Picking an option closes it. */
export function Picker<T extends string | number>({ title, options, value, onPick, onClose }: Props<T>) {
  const id = useId()
  return (
    <Sheet title={title} onClose={onClose}>
      <div role="radiogroup" aria-label={title} className="sheet-rows">
        {options.map(([option, label, description]) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === value}
            className="sheet-row"
            // The option's name is its label; the line under it describes it.
            aria-labelledby={description ? `${id}-${option}` : undefined}
            aria-describedby={description ? `${id}-${option}-note` : undefined}
            onClick={() => {
              onPick(option)
              onClose()
            }}
          >
            {description ? (
              <span className="row-text">
                <span id={`${id}-${option}`}>{label}</span>
                <span id={`${id}-${option}-note`} className="row-note">
                  {description}
                </span>
              </span>
            ) : (
              label
            )}
            {option === value && (
              <svg className="check" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 10.5l4 4 8-9" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** The switch drawn at the end of a row; the row itself is the `role="switch"` button. */
export const SwitchMark = ({ on }: { on: boolean }) => <span className={on ? 'switch on' : 'switch'} aria-hidden="true" />

export const Chevron = () => (
  <svg className="chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 4l6 6-6 6" />
  </svg>
)
