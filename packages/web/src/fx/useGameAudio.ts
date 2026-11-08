import { useEffect } from 'react'
import { audio } from './audio'
import { CRACKLE, crackleVolume, SFX } from './sound'

/**
 * The game screen's audio: loads the sound effects when it mounts, plays the music while it's up
 * (so it stops on the results screen), and keeps the six-streak crackle at the streak's level.
 * Off (`enabled` false) when timing is instant.
 */
export function useGameAudio({ enabled, streak }: { enabled: boolean; streak: number }): void {
  useEffect(() => {
    if (!enabled) return
    audio.preload(SFX)
    audio.setMusic(true)
    return () => audio.setMusic(false)
  }, [enabled])

  useEffect(() => {
    if (enabled) audio.setLoop(CRACKLE, crackleVolume(streak))
  }, [enabled, streak])

  useEffect(() => () => audio.setLoop(CRACKLE, 0), [])
}
