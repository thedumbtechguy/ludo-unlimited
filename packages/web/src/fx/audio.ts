/** Each category has its own volume: sound effects and music switch on and off apart. */
export type Bus = 'sfx' | 'music'

/** A linear ramp that reaches `value` at `at` (seconds on the audio clock). */
export type Ramp = { value: number; at: number }

export type Gain = {
  /** Drop what's scheduled, hold the current value, then ramp through `ramps` in order. */
  ramp: (ramps: Ramp[]) => void
}

export type Voice = { gain: Gain; stop: (at?: number) => void }

export type PlayOptions = { bus: Bus; volume: number; rate?: number; loop?: boolean }

/** What the engine needs from Web Audio, so tests can hand it a fake. */
export interface AudioBackend {
  now: () => number
  resume: () => Promise<void>
  suspend: () => Promise<void>
  /** Fetch and decode `/audio/<name>`, in a format this browser plays. */
  load: (name: string) => Promise<unknown>
  play: (clip: unknown, options: PlayOptions) => Voice
  bus: (bus: Bus) => Gain
}

export type Prefs = { sound: boolean; music: boolean }

/** How a sound is played: its volume, and how far its pitch may wander (0.05 is ±5%). */
export type Sound = { volume: number; vary?: number }

/**
 * The game's audio. Silent until `start()` (never called in tests or `?fast`), and silent with no
 * Web Audio at all. Sound effects play from clips loaded ahead by `preload`; one not loaded yet
 * is skipped rather than played late.
 */
export class AudioEngine {
  private backend: AudioBackend | null | undefined
  private live = false
  private unlocked = false
  private prefs: Prefs = { sound: true, music: true }
  private clips = new Map<string, Promise<unknown>>()
  private ready = new Map<string, unknown>()
  private cleanup: (() => void)[] = []

  constructor(
    private make: () => AudioBackend | undefined,
    private random: () => number = Math.random,
  ) {}

  /** Made on first use, so nothing touches Web Audio before the app starts audio. */
  private get audio(): AudioBackend | undefined {
    if (!this.live) return undefined
    if (this.backend === undefined) this.backend = this.make() ?? null
    return this.backend ?? undefined
  }

  /** Listen for the first tap or key (browsers only start audio after one). */
  start(target: Window = window): void {
    if (this.live) return
    this.live = true
    const unlock = () => {
      const audio = this.audio
      if (!audio) return
      this.unlocked = true
      audio.resume()
      target.removeEventListener('pointerdown', unlock, true)
      target.removeEventListener('keydown', unlock, true)
    }
    target.addEventListener('pointerdown', unlock, true)
    target.addEventListener('keydown', unlock, true)
    this.cleanup.push(() => {
      target.removeEventListener('pointerdown', unlock, true)
      target.removeEventListener('keydown', unlock, true)
    })
  }

  stop(): void {
    this.cleanup.forEach((fn) => fn())
    this.cleanup = []
    this.live = false
  }

  setPrefs(prefs: Prefs): void {
    this.prefs = prefs
  }

  /** Start loading clips; ones already loading or loaded are left alone. */
  preload(names: readonly string[]): void {
    names.forEach((name) => this.load(name))
  }

  load(name: string): Promise<unknown> | undefined {
    const audio = this.audio
    if (!audio) return undefined
    let clip = this.clips.get(name)
    if (!clip) {
      clip = audio.load(name)
      this.clips.set(name, clip)
      clip.then(
        (loaded) => this.ready.set(name, loaded),
        () => this.clips.delete(name),
      )
    }
    return clip
  }

  /** A one-shot sound effect, if sound is on and its clip has loaded. */
  play(name: string, sound: Sound): Voice | undefined {
    const audio = this.audio
    const clip = this.ready.get(name)
    if (!audio || !this.prefs.sound || clip === undefined) return undefined
    const vary = sound.vary ?? 0
    const rate = 1 + (this.random() * 2 - 1) * vary
    return audio.play(clip, { bus: 'sfx', volume: sound.volume, rate })
  }
}

const BASE = import.meta.env.BASE_URL

/** The real thing: one AudioContext, one gain node per bus. Undefined without Web Audio (jsdom). */
export function createWebBackend(): AudioBackend | undefined {
  if (typeof AudioContext === 'undefined') return undefined
  const ctx = new AudioContext()
  const opus = new Audio().canPlayType('audio/webm; codecs="opus"') !== ''
  const gain = (node: GainNode): Gain => ({
    ramp: (ramps) => {
      const now = ctx.currentTime
      node.gain.cancelScheduledValues(now)
      node.gain.setValueAtTime(node.gain.value, now)
      ramps.forEach(({ value, at }) => node.gain.linearRampToValueAtTime(value, Math.max(at, now)))
    },
  })
  const busNode = (volume: number) => {
    const node = ctx.createGain()
    node.gain.value = volume
    node.connect(ctx.destination)
    return node
  }
  const buses: Record<Bus, GainNode> = { sfx: busNode(1), music: busNode(0) }
  const decode = async (name: string, ext: string) => {
    const response = await fetch(`${BASE}audio/${name}.${ext}`)
    if (!response.ok) throw new Error(`${name}.${ext}: ${response.status}`)
    return ctx.decodeAudioData(await response.arrayBuffer())
  }
  return {
    now: () => ctx.currentTime,
    resume: () => ctx.resume(),
    suspend: () => ctx.suspend(),
    // Opus where it plays; AAC otherwise, and when a browser claims Opus but can't decode it.
    load: (name) => (opus ? decode(name, 'webm').catch(() => decode(name, 'm4a')) : decode(name, 'm4a')),
    play: (clip, { bus, volume, rate = 1, loop = false }) => {
      const source = ctx.createBufferSource()
      source.buffer = clip as AudioBuffer
      source.playbackRate.value = rate
      source.loop = loop
      const node = ctx.createGain()
      node.gain.value = volume
      source.connect(node).connect(buses[bus])
      source.onended = () => node.disconnect()
      source.start()
      return { gain: gain(node), stop: (at) => source.stop(at) }
    },
    bus: (bus) => gain(buses[bus]),
  }
}

/** The app's one audio engine. */
export const audio = new AudioEngine(createWebBackend)
