/**
 * New versions arrive through the service worker. One is never applied in the middle of a game (the
 * reload would drop you on the home screen); it waits until the game is over, or applies straight
 * away when no game is on.
 */
let apply: (() => void) | undefined
let playing = false
// A room asked for a newer app: apply it the moment it's ready, game or not.
let wanted = false
let registration: ServiceWorkerRegistration | undefined

/** A new version is ready; `reload` switches to it. */
export function updateReady(reload: () => void): void {
  apply = reload
  if (!playing || wanted) reload()
}

/** The service worker, so a room that needs a newer app can ask it to look for one. */
export function setRegistration(next: ServiceWorkerRegistration | undefined): void {
  registration = next
}

export function setPlaying(next: boolean): void {
  playing = next
  if (!playing && apply) apply()
}

/**
 * The room `code` needs a newer app: switch now, game or not. Tried once per room and tab, so an app
 * with no newer version to get doesn't reload forever. False when it was tried already.
 */
export function updateNow(code: string): boolean {
  const key = `ludo-unlimited:updated-for:${code}`
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
  } catch {
    // Storage blocked: no way to tell a second try from the first, so don't risk a loop.
    return false
  }
  wanted = true
  if (apply) apply()
  // The service worker fetches the new version and `updateReady` applies it; without one, reload.
  else if (registration) void registration.update()
  else location.reload()
  return true
}
