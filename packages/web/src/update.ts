/**
 * New versions arrive through the service worker. One is never applied in the middle of a game (the
 * reload would drop you on the home screen); it waits until the game is over, or applies straight
 * away when no game is on.
 */
let apply: (() => void) | undefined
let playing = false

/** A new version is ready; `reload` switches to it. */
export function updateReady(reload: () => void): void {
  apply = reload
  if (!playing) reload()
}

export function setPlaying(next: boolean): void {
  playing = next
  if (!playing && apply) apply()
}
