import {
  ChartContainer,
  ChartSummaryItem,
  ChartSummaryLabel,
  ChartSummaryValue,
  ChartTitle,
} from '#/components/ui/chart'

interface InsightsGivingBreakdownProps {
  userGuest: { createdAs: string; percent: string }[]
  weekendWeekday: { percent: string; period: string }[]
}

export function InsightsGivingBreakdown(props: InsightsGivingBreakdownProps) {
  const { weekendWeekday, userGuest } = props
  return (
    <ChartContainer>
      <ChartTitle>Giving Breakdown</ChartTitle>
      <div className="flex grow items-center justify-center">
        <div className="grid w-full grid-cols-2 gap-y-12 p-4">
          {weekendWeekday.map((x) => {
            return (
              <ChartSummaryItem className="items-center" key={x.period}>
                <ChartSummaryLabel>{x.period}</ChartSummaryLabel>
                <ChartSummaryValue className="text-xl sm:text-2xl md:text-3xl">
                  {x.percent}%
                </ChartSummaryValue>
              </ChartSummaryItem>
            )
          })}

          {userGuest.map((x) => {
            return (
              <ChartSummaryItem className="items-center" key={x.createdAs}>
                <ChartSummaryLabel>{x.createdAs}</ChartSummaryLabel>
                <ChartSummaryValue className="text-xl sm:text-2xl md:text-3xl">
                  {x.percent}%
                </ChartSummaryValue>
              </ChartSummaryItem>
            )
          })}
        </div>
      </div>
    </ChartContainer>
  )
}
