import type { Analytics } from '#/modules/analytics'

import { count } from './format'
import { Swatch } from './panel'

const payments = (n: number) => `${count.format(n)} ${n === 1 ? 'payment is' : 'payments are'}`

export function Attention(props: { attention: Analytics['attention'] }) {
  const { held, stalePending } = props.attention
  const notices = [
    held > 0 && `${payments(held)} held. Resolve them at eGHL.`,
    stalePending > 0 &&
      `${payments(stalePending)} still pending after the check window. Resolve them at eGHL.`,
  ].filter((notice) => notice !== false)

  if (notices.length === 0) {
    return null
  }
  return (
    <ul className="flex flex-wrap gap-3" aria-label="Needs attention">
      {notices.map((notice) => (
        <li
          className="flex flex-1 basis-72 items-center gap-x-2.5 border border-border bg-base-0/50 px-4 py-3 text-sm"
          key={notice}
        >
          <Swatch color="var(--color-fg-warning)" />
          {notice}
        </li>
      ))}
    </ul>
  )
}
