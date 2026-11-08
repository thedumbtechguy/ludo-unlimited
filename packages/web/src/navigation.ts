/**
 * The app's place in the browser history, so the back gesture steps back through screens and closes sheets.
 * Each screen has an entry `{ depth, route }`, depth 0 being the first. An open sheet adds an entry on top.
 * Moves the app makes itself (dropping a closed sheet's entry, going back to the first entry) aren't reported.
 */
type Entry = { depth: number; route?: unknown }

const entry = (): Entry => history.state ?? { depth: 0 }

// Traversals we started whose pops are ours, and what waits for them to land.
let ours = 0
let waiting: (() => void)[] = []
const sheets: (() => void)[] = []
// Sheets closed this moment whose entries are still there: one opened straight after takes the entry over.
let closing = 0
let listener: ((route: unknown) => void) | undefined

function settled(op: () => void) {
  if (ours) waiting.push(op)
  else op()
}

function traverse(delta: number) {
  settled(() => {
    ours++
    history.go(delta)
  })
}

// A screen change takes any open sheets' entries with it.
function dropSheets() {
  const entries = sheets.length + closing
  sheets.length = 0
  closing = 0
  if (entries) traverse(-entries)
}

addEventListener('popstate', () => {
  if (ours) {
    ours--
    while (!ours && waiting.length) waiting.shift()!()
    return
  }
  const close = sheets.pop()
  if (close) close()
  else listener?.(entry().route)
})

/** How many screens back the first entry is. */
export const depth = () => entry().depth

export function push(route: unknown, url: string) {
  dropSheets()
  settled(() => history.pushState({ depth: entry().depth + 1, route }, '', url))
}

export function replace(route: unknown, url: string) {
  dropSheets()
  settled(() => history.replaceState({ depth: entry().depth, route }, '', url))
}

/** Like the back gesture: the screen below is reported to `onPop`. */
export function back() {
  dropSheets()
  settled(() => history.back())
}

/** Goes back to the first entry, quietly, and makes it `route`. */
export function restart(route: unknown, url: string) {
  dropSheets()
  settled(() => {
    if (depth()) traverse(-depth())
  })
  settled(() => history.replaceState({ depth: 0, route }, '', url))
}

/** Hears the back (or forward) gesture landing on a screen's entry. */
export function onPop(next: (route: unknown) => void) {
  listener = next
  return () => {
    if (listener === next) listener = undefined
  }
}

/** An open sheet's entry: back calls `close`. The returned function drops the entry when the sheet closes otherwise. */
export function openSheet(close: () => void) {
  sheets.push(close)
  // Reopened at once (React's strict mode does this) or swapped for another sheet: keep the entry.
  if (closing) closing--
  else settled(() => history.pushState({ ...entry(), sheet: true }, '', location.href))
  return () => {
    const at = sheets.indexOf(close)
    if (at < 0) return
    sheets.splice(at, 1)
    closing++
    queueMicrotask(() => {
      if (!closing) return
      closing--
      traverse(-1)
    })
  }
}
