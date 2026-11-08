import { useEffect } from 'react'
import { audio } from './audio'
import { CRACKLE, crackleVolume, SFX } from './sound'

/**
 * The game screen's audio: loads the sound effects when it mounts and keeps the six-streak
 * crackle at the streak's level. Off (`enabled` false) when timing is instant.
 */
export function useGameAudio({ enabled, streak }: { enabled: boolean; streak: number }): void {
  useEffect(() => {
    if (enabled) audio.preload(SFX)
  }, [enabled])

  useEffect(() => {
    if (enabled) audio.setLoop(CRACKLE, crackleVolume(streak))
  }, [enabled, streak])

  useEffect(() => () => audio.setLoop(CRACKLE, 0), [])
}
