import { Meter, SegmentedBar } from '#/components/ui/chart'
import type { Analytics, Rate } from '#/modules/analytics'

import { count, percent, rangeText, rateText, shareText } from './format'
import { Note, Panel, Swatch } from './panel'

const US_GAVE_AGAIN_AVERAGE = { firstTime: 0.19, repeat: 0.59 }

interface Part {
  color: string
  label: string
  value: number
}

function Parts(props: { parts: readonly Part[]; total: number }) {
  return (
    <ul className="flex flex-col gap-y-2 text-sm">
      {props.parts.map((part) => {
        const share = shareText(part.value, props.total)
        return (
          <li className="flex justify-between gap-x-2" key={part.label}>
            <span className="flex items-center gap-x-2">
              <Swatch color={part.color} />
              {part.label}
            </span>
            <span className="text-fg-1 tabular-nums">
              {count.format(part.value)}
              {share !== null && <span className="ml-1.5 text-fg-subtle">{share}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Column(props: { children: React.ReactNode; title: string }) {
  return (
    <div className="flex min-w-0 flex-1 basis-72 flex-col gap-y-4 border-border p-4 not-first:border-t md:not-first:border-t-0 md:not-first:border-l">
      <h3 className="text-xs text-fg-subtle">{props.title}</h3>
      {props.children}
    </div>
  )
}

function GaveAgainRow(props: {
  benchmark: number
  label: string
  note: string
  rate: Rate | null
}) {
  const text = rateText(props.rate)
  return (
    <div className="flex flex-col gap-y-1.5">
      <div className="flex items-baseline justify-between gap-x-2">
        <span className="text-sm text-fg-1">{props.label}</span>
        <span className="tabular-nums">
          <span className="text-xl text-fg-1">{text.main}</span>
          {text.detail !== '' && (
            <span className="ml-1.5 text-xs text-fg-subtle">{text.detail}</span>
          )}
        </span>
      </div>
      <Meter
        label={props.label}
        marker={{
          label: `US nonprofit average: about ${Math.round(props.benchmark * 100)}%`,
          value: props.benchmark,
        }}
        value={text.share}
      />
      <Note>{props.note}</Note>
    </div>
  )
}

export function DonorsPanel(props: { donors: Analytics['donors'] }) {
  const { change, gaveAgain, notYet, regular, segments } = props.donors
  const who: Part[] = [
    { color: 'var(--color-fg-default)', label: 'Returning', value: segments.returning },
    { color: 'var(--color-chart-2)', label: 'New', value: segments.new },
    { color: 'var(--color-chart-3)', label: 'Came back after a gap', value: segments.cameBack },
  ]
  const moves: Part[] = [
    { color: 'var(--color-fg-success)', label: 'Gave more', value: change.more },
    { color: 'var(--color-fg-subtle)', label: 'About the same', value: change.same },
    { color: 'var(--color-chart-5)', label: 'Gave less', value: change.less },
  ]
  const donorCount = segments.returning + segments.new + segments.cameBack
  const bothSpans = change.more + change.same + change.less
  const regularShare = regular.donors > 0 ? percent(regular.shareOfMoney) : null

  return (
    <Panel title="Donors">
      <div className="flex flex-col md:flex-row md:flex-wrap">
        <Column title="Who gave this period">
          <p className="flex items-baseline gap-x-2">
            <span className="text-2xl text-fg-1 tabular-nums">{count.format(donorCount)}</span>
            <span className="text-fg-muted">donors</span>
          </p>
          <SegmentedBar label="Donors this period" segments={who} />
          <Parts parts={who} total={donorCount} />
          <div className="border-t border-border pt-3">
            <p className="text-sm text-fg-1">
              {count.format(notYet)} have not given yet this period
            </p>
            <Note>They gave in the year before it.</Note>
          </div>
        </Column>

        <Column title="Gave again within 12 months">
          <GaveAgainRow
            benchmark={US_GAVE_AGAIN_AVERAGE.firstTime}
            label="First-time givers"
            note="Their first gift was in the window."
            rate={gaveAgain.firstTime}
          />
          <GaveAgainRow
            benchmark={US_GAVE_AGAIN_AVERAGE.repeat}
            label="Repeat givers"
            note="They had given before the window too."
            rate={gaveAgain.repeat}
          />
          <Note className="border-t border-border pt-3">
            Of the people who gave from {rangeText(gaveAgain.window)}, the share who gave again in
            the 12 months after. The window moves with the period&apos;s last day, so the rate does
            not drop every January. The tick marks the US nonprofit average.
          </Note>
        </Column>

        <Column title="Returning donors against the same days last year">
          <SegmentedBar label="Donors who gave in both periods, by change" segments={moves} />
          <Parts parts={moves} total={bothSpans} />
          <Note>
            {count.format(bothSpans)} donors gave in both periods. About the same means within 10%.
          </Note>
          <div className="border-t border-border pt-3">
            <p className="text-sm text-fg-1">
              {count.format(regular.donors)} regular givers
              {regularShare !== null && ` gave ${regularShare} of the money`}
            </p>
            <Note>
              Gave in {regular.minMonths} or more of the last 12 months. The share is of the last 12
              months&apos; money.
            </Note>
          </div>
        </Column>
      </div>
    </Panel>
  )
}
