import type { XAxisProps as RechartXAxisProps } from 'recharts'
import { XAxis as RechartXAxis } from 'recharts'

type XAxisProps = Pick<
  RechartXAxisProps,
  'dataKey' | 'interval' | 'tickFormatter'
>

export function XAxis(props: XAxisProps) {
  return (
    <RechartXAxis
      axisLine={false}
      tick={{ fill: 'currentColor' }}
      tickLine={false}
      tickMargin={10}
      {...props}
    />
  )
}
