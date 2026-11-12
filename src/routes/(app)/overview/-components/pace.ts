export const THIS_YEAR = 'var(--color-chart-1)'
export const LAST_YEAR = 'var(--color-fg-subtle)'
const PICKED_YEAR = 'var(--color-chart-2)'

/** How the all-years chart and its legend draw `year`'s line. Older years fade. */
export function paceStyle(year: number, currentYear: number, picked: number) {
  const isPicked = year === picked
  const width = isPicked ? 2.5 : 1.5
  if (year === currentYear) {
    return { color: THIS_YEAR, dashed: false, opacity: 1, width }
  }
  return {
    color: isPicked ? PICKED_YEAR : LAST_YEAR,
    dashed: !isPicked,
    opacity: isPicked ? 1 : Math.max(0.2, 1 / (currentYear - year)),
    width,
  }
}
