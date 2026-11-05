import { ChartContainer } from './chart-container'
import { ChartTitle } from './chart-title'

export function ChartFallback(props: { legend?: boolean }) {
  return (
    <ChartContainer>
      <ChartTitle>&nbsp;</ChartTitle>
      {props.legend === true && <div className="mt-4 h-5" />}
      <div className="aspect-video" />
    </ChartContainer>
  )
}
