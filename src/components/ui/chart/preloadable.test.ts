import { Suspense, createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { prerender } from 'react-dom/static'
import { describe, expect, it } from 'vitest'

import { preloadable } from './preloadable'

const chartModule = { Chart: (props: { title: string }) => createElement('h1', null, props.title) }

function page(Chart: (props: { title: string }) => React.ReactNode) {
  return createElement(
    Suspense,
    { fallback: createElement('p', null, 'placeholder') },
    createElement(Chart, { title: 'chart' }),
  )
}

describe('a preloadable component', () => {
  it('waits for its module when nothing loaded it first', async () => {
    expect.hasAssertions()
    const Chart = preloadable(() => Promise.resolve(chartModule)).component((m) => m.Chart)

    expect(renderToString(page(Chart))).toContain('placeholder')

    const { prelude } = await prerender(page(Chart))
    await expect(new Response(prelude).text()).resolves.toContain('<h1>chart</h1>')
  })

  it('draws its module in the first render once it has loaded', async () => {
    expect.hasAssertions()
    const chart = preloadable(() => Promise.resolve(chartModule))
    const Chart = chart.component((m) => m.Chart)

    await chart.load()

    expect(renderToString(page(Chart))).toContain('<h1>chart</h1>')
  })
})
