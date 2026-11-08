import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioEngine, createWebBackend, DUCKED_VOLUME, MUSIC_VOLUME, type AudioBackend, type Bus, type PlayOptions, type Ramp } from './audio'

type Played = PlayOptions & { clip: unknown; ramps: Ramp[][]; stoppedAt?: number }

/** Records what the engine asks of Web Audio, on a clock the test moves by hand. */
function fakeBackend() {
  const fake = {
    time: 0,
    state: 'suspended' as 'suspended' | 'running',
    loads: [] as string[],
    played: [] as Played[],
    buses: { sfx: [], music: [] } as Record<Bus, Ramp[][]>,
    backend: undefined as unknown as AudioBackend,
  }
  fake.backend = {
    now: () => fake.time,
    resume: async () => {
      fake.state = 'running'
    },
    suspend: async () => {
      fake.state = 'suspended'
    },
    load: async (name) => {
      fake.loads.push(name)
      return `clip:${name}`
    },
    play: (clip, options) => {
      const played: Played = { clip, ...options, ramps: [] }
      fake.played.push(played)
      return { gain: { ramp: (ramps) => played.ramps.push(ramps) }, stop: (at) => (played.stoppedAt = at ?? fake.time) }
    },
    bus: (bus) => ({ ramp: (ramps) => fake.buses[bus].push(ramps) }),
  }
  return fake
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function startedEngine(random = () => 0.5) {
  const fake = fakeBackend()
  const engine = new AudioEngine(() => fake.backend, random)
  engine.start()
  return { fake, engine }
}

const kick = { volume: 0.9 }

describe('AudioEngine', () => {
  let engine: AudioEngine | undefined
  afterEach(() => engine?.stop())

  it('does nothing until started, and never makes a backend before then', () => {
    const make = vi.fn(() => fakeBackend().backend)
    engine = new AudioEngine(make)
    engine.preload(['kick'])
    expect(engine.play('kick', kick)).toBeUndefined()
    expect(make).not.toHaveBeenCalled()
  })

  it('is silent without Web Audio', async () => {
    expect(createWebBackend()).toBeUndefined()
    engine = new AudioEngine(createWebBackend)
    engine.start()
    engine.preload(['kick'])
    await flush()
    expect(engine.play('kick', kick)).toBeUndefined()
  })

  it('loads each clip once and plays it on the sfx bus', async () => {
    const started = startedEngine()
    engine = started.engine
    engine.preload(['kick', 'tap'])
    engine.preload(['kick'])
    await flush()
    expect(started.fake.loads).toEqual(['kick', 'tap'])
    engine.play('kick', kick)
    expect(started.fake.played).toEqual([expect.objectContaining({ clip: 'clip:kick', bus: 'sfx', volume: 0.9, rate: 1 })])
  })

  it('skips a sound whose clip has not loaded yet', async () => {
    const started = startedEngine()
    engine = started.engine
    expect(engine.play('kick', kick)).toBeUndefined()
    expect(started.fake.played).toEqual([])
  })

  it('plays nothing while Sound is off', async () => {
    const started = startedEngine()
    engine = started.engine
    engine.preload(['kick'])
    await flush()
    engine.setPrefs({ sound: false, music: true })
    engine.play('kick', kick)
    expect(started.fake.played).toEqual([])
    engine.setPrefs({ sound: true, music: true })
    engine.play('kick', kick)
    expect(started.fake.played).toHaveLength(1)
  })

  it('varies the pitch within the sound’s range', async () => {
    const rolls = [0, 1, 0.25]
    const started = startedEngine(() => rolls.shift()!)
    engine = started.engine
    engine.preload(['step'])
    await flush()
    for (let i = 0; i < 3; i++) engine.play('step', { volume: 0.2, vary: 0.1 })
    expect(started.fake.played.map((p) => p.rate)).toEqual([0.9, 1.1, 0.95])
  })

  describe('a looping sound', () => {
    it('fades in, follows the level, and fades out and stops at 0', () => {
      const started = startedEngine()
      engine = started.engine
      engine.preload(['fire'])
      return flush().then(() => {
        engine!.setLoop('fire', 0.2)
        started.fake.time = 1
        engine!.setLoop('fire', 0.4)
        started.fake.time = 2
        engine!.setLoop('fire', 0)
        const [voice] = started.fake.played
        expect(started.fake.played).toHaveLength(1)
        expect(voice).toMatchObject({ clip: 'clip:fire', bus: 'sfx', volume: 0, loop: true })
        expect(voice.ramps).toEqual([[{ value: 0.2, at: 0.3 }], [{ value: 0.4, at: 1.3 }], [{ value: 0, at: 2.6 }]])
        expect(voice.stoppedAt).toBe(2.6)
      })
    })

    it('stays silent while Sound is off, and picks up again when it comes back on', async () => {
      const started = startedEngine()
      engine = started.engine
      engine.preload(['fire'])
      await flush()
      engine.setPrefs({ sound: false, music: true })
      engine.setLoop('fire', 0.3)
      expect(started.fake.played).toEqual([])
      engine.setPrefs({ sound: true, music: true })
      expect(started.fake.played).toHaveLength(1)
      engine.setPrefs({ sound: false, music: true })
      expect(started.fake.played[0].stoppedAt).toBeDefined()
    })
  })

  describe('music', () => {
    const music = (fake: ReturnType<typeof fakeBackend>) => fake.played.filter((p) => p.bus === 'music')

    it('loads only once a game asks for it, then loops, fading in at a low volume', async () => {
      const started = startedEngine()
      engine = started.engine
      await flush()
      expect(started.fake.loads).toEqual([])
      engine.setMusic(true)
      await flush()
      expect(started.fake.loads).toEqual(['music'])
      const [track] = music(started.fake)
      expect(track).toMatchObject({ clip: 'clip:music', loop: true, volume: 0 })
      expect(track.ramps).toEqual([[{ value: 1, at: 1.5 }]])
      expect(started.fake.buses.music).toEqual([[{ value: MUSIC_VOLUME, at: 0 }]])
    })

    it('never loads or plays while Music is off, and starts when it is switched on', async () => {
      const started = startedEngine()
      engine = started.engine
      engine.setPrefs({ sound: true, music: false })
      engine.setMusic(true)
      await flush()
      expect(started.fake.loads).toEqual([])
      expect(music(started.fake)).toEqual([])
      engine.setPrefs({ sound: true, music: true })
      await flush()
      expect(music(started.fake)).toHaveLength(1)
    })

    it('fades out and stops when Music is switched off or the game leaves', async () => {
      const started = startedEngine()
      engine = started.engine
      engine.setMusic(true)
      await flush()
      started.fake.time = 10
      engine.setPrefs({ sound: true, music: false })
      const [track] = music(started.fake)
      expect(track.ramps.at(-1)).toEqual([{ value: 0, at: 10.5 }])
      expect(track.stoppedAt).toBe(10.5)
      engine.setPrefs({ sound: true, music: true })
      await flush()
      started.fake.time = 20
      engine.setMusic(false)
      expect(music(started.fake)[1].stoppedAt).toBe(20.5)
    })

    it('crossfades rather than doubling up when a game restarts', async () => {
      const started = startedEngine()
      engine = started.engine
      engine.setMusic(true)
      await flush()
      engine.setMusic(false)
      engine.setMusic(true)
      await flush()
      const [old, fresh] = music(started.fake)
      expect(old.stoppedAt).toBeDefined()
      expect(fresh.stoppedAt).toBeUndefined()
      expect(started.fake.loads).toEqual(['music'])
    })

    it('ducks under a big moment for about 1.5s, then comes back up', async () => {
      const started = startedEngine()
      engine = started.engine
      engine.setMusic(true)
      await flush()
      started.fake.time = 30
      engine.duck()
      expect(started.fake.buses.music.at(-1)).toEqual([
        { value: DUCKED_VOLUME, at: 30.08 },
        { value: DUCKED_VOLUME, at: 31.5 },
        { value: MUSIC_VOLUME, at: 32.3 },
      ])
    })

    it('does not duck when no music plays', async () => {
      const started = startedEngine()
      engine = started.engine
      engine.duck()
      engine.setPrefs({ sound: true, music: false })
      engine.setMusic(true)
      await flush()
      engine.duck()
      expect(started.fake.buses.music).toEqual([])
    })

    it('pauses while the page is hidden and resumes after', async () => {
      const started = startedEngine()
      engine = started.engine
      engine.setMusic(true)
      window.dispatchEvent(new Event('pointerdown'))
      await flush()
      expect(started.fake.state).toBe('running')
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(started.fake.state).toBe('suspended')
      hidden.mockReturnValue(false)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(started.fake.state).toBe('running')
      hidden.mockRestore()
    })

    it('does not start audio on coming back before the first tap', async () => {
      const started = startedEngine()
      engine = started.engine
      engine.setMusic(true)
      await flush()
      const resume = vi.spyOn(started.fake.backend, 'resume')
      document.dispatchEvent(new Event('visibilitychange'))
      expect(resume).not.toHaveBeenCalled()
    })
  })

  it('starts the audio on the first tap or key, once', async () => {
    const started = startedEngine()
    engine = started.engine
    const resume = vi.spyOn(started.fake.backend, 'resume')
    expect(started.fake.state).toBe('suspended')
    window.dispatchEvent(new Event('pointerdown'))
    expect(started.fake.state).toBe('running')
    window.dispatchEvent(new Event('keydown'))
    window.dispatchEvent(new Event('pointerdown'))
    expect(resume).toHaveBeenCalledTimes(1)
  })
})
