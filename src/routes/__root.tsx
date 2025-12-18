import geistFont from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import loraFont from '@fontsource-variable/lora/files/lora-latin-wght-normal.woff2?url'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { lazy } from 'react'

import { config } from '#/core/brand/config'

import css from '#/styles/globals.css?url'

const Toaster = lazy(() => import('../components/ui/toaster/toaster'))

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        // eslint-disable-next-line unicorn/text-encoding-identifier-case
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: config.entity },
      ],
      links: [
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: geistFont,
          crossOrigin: 'anonymous',
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: loraFont,
          crossOrigin: 'anonymous',
        },
        { rel: 'stylesheet', href: css },
      ],
    }),
    shellComponent: RootDocument,
  },
)

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark h-full" lang="en">
      <head>
        <HeadContent />
        <style
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: `
@font-face {
  font-family: 'Geist Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('${geistFont}') format('woff2-variations');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

@font-face {
  font-family: 'Lora Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 400 700;
  src: url('${loraFont}') format('woff2-variations');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}`,
          }}
        />
      </head>
      <body className="relative flex min-h-full flex-col bg-base-1 text-fg-1">
        {children}
        {import.meta.env.MODE === 'development' && (
          <TanStackDevtools
            config={{ position: 'bottom-left', triggerHidden: true }}
            plugins={[
              { name: 'TanStack Query', render: <ReactQueryDevtoolsPanel /> },
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
        <Scripts />
        <Toaster />
      </body>
    </html>
  )
}
