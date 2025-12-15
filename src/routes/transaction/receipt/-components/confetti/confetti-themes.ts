import type { Options, Shape } from 'canvas-confetti'
import confetti from 'canvas-confetti'

import { clientTz, now } from '#/core/date'

export interface ConfettiTheme {
  emit: ({
    remaining,
    totalDuration,
  }: {
    remaining: number
    totalDuration: number
  }) => Options[]
  mode: 'burst' | 'continuous'
  style: Options
  totalDuration?: number
}

export type SeasonalTheme = 'christmas' | 'firework' | 'hearts' | 'snow'

export function getThemes(c: typeof confetti) {
  function shape(emoji: string): Shape {
    return c.shapeFromText({ text: emoji, scalar: 3 })
  }

  let skew = 1

  const BASE_THEMES: Record<SeasonalTheme, ConfettiTheme> = {
    snow: {
      totalDuration: 15 * 1000,
      mode: 'continuous',
      style: {
        particleCount: 1,
        startVelocity: 0,
        shapes: ['circle'],
        colors: ['#FAFAFA'],
      },
      emit: ({ remaining, totalDuration }) => {
        const ticks = Math.max(200, 500 * (remaining / totalDuration))
        skew = Math.max(0.8, skew - 0.001)
        return [
          {
            gravity: rand(0.4, 0.6),
            scalar: rand(0.4, 1),
            drift: rand(-0.4, 0.4),
            ticks,
            origin: { x: Math.random(), y: Math.random() * skew - 0.2 },
          },
        ]
      },
    },
    christmas: {
      mode: 'continuous',
      style: {
        startVelocity: 30,
        particleCount: 1,
        scalar: 3,
        spread: 90,
        ticks: 120,
        shapes: [
          shape('🎁'),
          shape('🎄'),
          shape('🎄'),
          shape('☃️'),
          shape('🔔'),
          shape('🔥'),
          shape('🌟'),
          shape('🤶'),
          shape('🤶'),
          shape('⛄'),
          shape('🎀'),
          shape('❄️'),
          shape('❄️'),
          shape('❄️'),
          shape('❄️'),
          shape('🎉'),
        ],
      },
      emit: () => [
        { angle: 60, origin: { x: 0 }, spread: 55 },
        { angle: 120, origin: { x: 1 }, spread: 55 },
      ],
    },

    firework: {
      mode: 'burst',
      style: { spread: 360, startVelocity: 30, ticks: 60 },
      emit: ({ remaining, totalDuration }) => {
        const count = 50 * (remaining / totalDuration)

        return [
          {
            particleCount: count,
            origin: { x: rand(0.1, 0.3), y: Math.random() - 0.2 },
          },
          {
            particleCount: count,
            origin: { x: rand(0.7, 0.9), y: Math.random() - 0.2 },
          },
        ]
      },
    },

    hearts: {
      mode: 'continuous',
      style: {
        shapes: [
          c.shapeFromPath({
            path: 'M167 72c19,-38 37,-56 75,-56 42,0 76,33 76,75 0,76 -76,151 -151,227 -76,-76 -151,-151 -151,-227 0,-42 33,-75 75,-75 38,0 57,18 76,56z',
          }),
        ],
        colors: ['#FFC0CB', '#FF69B4', '#FF1493', '#C71585'],
        particleCount: 2,
      },
      emit: () => [
        { angle: 60, origin: { x: 0 }, spread: 55 },
        { angle: 120, origin: { x: 1 }, spread: 55 },
      ],
    },
  }

  return BASE_THEMES[getSeason()]
}

function getSeason(): SeasonalTheme {
  const currentDate = now(clientTz)
  const month = currentDate.getMonth()
  const day = currentDate.getDate()

  if (month === 11) {
    if (day === 25) {
      return 'christmas'
    }
    return 'snow'
  }

  if (month === 1) {
    return 'hearts'
  }

  return Math.random() > 0.5 ? 'hearts' : 'firework'
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}
