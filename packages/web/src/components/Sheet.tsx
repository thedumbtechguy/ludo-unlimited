import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = { title: string; onClose: () => void; children: ReactNode; /** Name the dialog for screen readers only. */ hideTitle?: boolean }

const FOCUSABLE = 'button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])'

/** A sheet that slides up from the bottom over the dimmed table. Escape or a tap on the table closes it. */
export function Sheet({ title, onClose, children, hideTitle = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Focus the checked option (or the first one) on open; hand focus back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const sheet = ref.current!
    const first = sheet.querySelector<HTMLElement>('[aria-checked="true"]') ?? sheet.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => opener?.focus()
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    // Keep Tab inside the sheet while it is open.
    if (e.key !== 'Tab') return
    const items = [...ref.current!.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1
    e.preventDefault()
    items[next]?.focus()
  }

  return (
    <div className="sheet-layer" onKeyDown={onKeyDown}>
      <div className="sheet-backdrop" data-testid="sheet-backdrop" onClick={onClose} />
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className={hideTitle ? 'sr-only' : 'sheet-title'}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
