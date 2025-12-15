import { SelectYear } from './select-year'

interface OverviewYearSelectorProps {
  year: Year
  years: [Year, Year, ...Year[]]
}

type Year = 'all' | number

export function hasMultipleYears<T>(arr: T[]): arr is [T, T, ...T[]] {
  return arr.length >= 2
}

export function OverviewYearSelector(props: OverviewYearSelectorProps) {
  const { year, years } = props

  return (
    <div className="flex justify-end">
      <SelectYear
        defaultValue={year.toString()}
        values={mapYearsToStrings(years)}
      />
    </div>
  )
}

function mapYearsToStrings(
  years: OverviewYearSelectorProps['years'],
): [string, string, ...string[]] {
  return years.map(String) as [string, string, ...string[]]
}
