import type { Options, Shape } from 'canvas-confetti'
import type confetti from 'canvas-confetti'

import { clientTz, now } from '#/core/date'

export interface ConfettiTheme {
  emit: ({ remaining, totalDuration }: { remaining: number; totalDuration: number }) => Options[]
  mode: 'burst' | 'continuous'
  style: Options
  totalDuration?: number
}

export type SeasonalTheme = 'christmas' | 'firework' | 'hearts' | 'snow'

export function getThemes(c: typeof confetti) {
  function shape(emoji: string): Shape {
    return c.shapeFromText({ scalar: 3, text: emoji })
  }

  let skew = 1

  const BASE_THEMES: Record<SeasonalTheme, ConfettiTheme> = {
    christmas: {
      emit: () => [
        { angle: 60, origin: { x: 0 }, spread: 55 },
        { angle: 120, origin: { x: 1 }, spread: 55 },
      ],
      mode: 'continuous',
      style: {
        particleCount: 1,
        scalar: 3,
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
        spread: 90,
        startVelocity: 30,
        ticks: 120,
      },
    },
    firework: {
      emit: ({ remaining, totalDuration }) => {
        const count = 50 * (remaining / totalDuration)

        return [
          { origin: { x: rand(0.1, 0.3), y: Math.random() - 0.2 }, particleCount: count },
          { origin: { x: rand(0.7, 0.9), y: Math.random() - 0.2 }, particleCount: count },
        ]
      },
      mode: 'burst',
      style: { spread: 360, startVelocity: 30, ticks: 60 },
    },

    hearts: {
      emit: () => [
        { angle: 60, origin: { x: 0 }, spread: 55 },
        { angle: 120, origin: { x: 1 }, spread: 55 },
      ],
      mode: 'continuous',
      style: {
        colors: ['#FFC0CB', '#FF69B4', '#FF1493', '#C71585'],
        particleCount: 2,
        shapes: [
          c.shapeFromPath({
            path: 'M167 72c19,-38 37,-56 75,-56 42,0 76,33 76,75 0,76 -76,151 -151,227 -76,-76 -151,-151 -151,-227 0,-42 33,-75 75,-75 38,0 57,18 76,56z',
          }),
        ],
      },
    },

    snow: {
      emit: ({ remaining, totalDuration }) => {
        const ticks = Math.max(200, 500 * (remaining / totalDuration))
        skew = Math.max(0.8, skew - 0.001)
        return [
          {
            drift: rand(-0.4, 0.4),
            gravity: rand(0.4, 0.6),
            origin: { x: Math.random(), y: Math.random() * skew - 0.2 },
            scalar: rand(0.4, 1),
            ticks,
          },
        ]
      },
      mode: 'continuous',
      style: { colors: ['#FAFAFA'], particleCount: 1, shapes: ['circle'], startVelocity: 0 },
      totalDuration: 15 * 1000,
    },
  }

  return BASE_THEMES[getSeason()]
}

function getSeason(): SeasonalTheme {
  const currentDate = now(clientTz)
  const month = currentDate.getMonth()
  const day = currentDate.getDate()

  if (month === 11) {
    if (day === 24 || day === 25) {
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
