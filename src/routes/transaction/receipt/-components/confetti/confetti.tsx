import confetti from 'canvas-confetti'
import { useEffect } from 'react'

import { getThemes } from './confetti-themes'

const TOTAL_DURATION = 5000
const BURST_INTERVAL = 250

export default function Confetti() {
  useEffect(() => {
    const theme = getThemes(confetti)
    const start = Date.now()
    const totalDuration = theme.totalDuration ?? TOTAL_DURATION
    const end = start + totalDuration

    let lastBurst = 0
    let animationId: number

    function frame(timestamp: number) {
      const now = Date.now()
      const remaining = Math.max(0, end - now)

      if (theme.mode === 'continuous') {
        const emitters = theme.emit({ remaining, totalDuration })
        for (const p of emitters) {
          void confetti({ ...theme.style, ...p })
        }
      } else {
        if (timestamp - lastBurst > BURST_INTERVAL) {
          lastBurst = timestamp
          const patterns = theme.emit({ remaining, totalDuration })
          for (const p of patterns) {
            void confetti({ ...theme.style, ...p })
          }
        }
      }

      if (remaining > 0) {
        animationId = requestAnimationFrame(frame)
      }
    }

    animationId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [])

  return null
}
