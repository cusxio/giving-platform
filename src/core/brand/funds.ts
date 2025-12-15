import type { Icon } from '@phosphor-icons/react'
import {
  ChurchIcon,
  GlobeIcon,
  // HammerIcon,
  HandHeartIcon,
  PottedPlantIcon,
} from '@phosphor-icons/react/dist/ssr'

export const funds = [
  'offering',
  'tithe',
  'mission',
  'future',
  // 'builder',
] as const

export type Fund = (typeof funds)[number]

export const FUND_CHART_COLOR_MAP: Record<'builder' | Fund, string> = {
  offering: 'text-chart-1',
  tithe: 'text-chart-2',
  mission: 'text-chart-3',
  future: 'text-chart-4',
  builder: 'text-chart-5',
}

export const FUND_ICON_MAP: Record<Fund, Icon> = {
  // builder: HammerIcon,
  offering: HandHeartIcon,
  future: PottedPlantIcon,
  mission: GlobeIcon,
  tithe: ChurchIcon,
}

export const FUND_COLOR_MAP: Record<Fund, string> = {
  // builder: 'bg-brown-bg text-brown-fg',
  future: 'bg-purple-bg text-purple-fg',
  mission: 'bg-lime-bg text-lime-fg',
  offering: 'bg-red-bg text-red-fg',
  tithe: 'bg-yellow-bg text-yellow-fg',
}
