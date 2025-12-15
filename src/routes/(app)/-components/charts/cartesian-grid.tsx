import { CartesianGrid as RechartCartesianGrid } from 'recharts'

export function CartesianGrid() {
  return (
    <RechartCartesianGrid
      className="stroke-border"
      strokeDasharray="3 3"
      vertical={false}
    />
  )
}
