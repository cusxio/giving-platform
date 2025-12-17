import type { YAxisProps as RechartYAxisProps } from 'recharts'
import { YAxis as RechartYAxis } from 'recharts'

type YAxisProps = Pick<RechartYAxisProps, 'tickFormatter'>

export function YAXis(props: YAxisProps) {
  return (
    <RechartYAxis
      axisLine={false}
      tick={{ fill: 'currentColor' }}
      tickLine={false}
      tickMargin={5}
      width="auto"
      {...props}
    />
  )
}
