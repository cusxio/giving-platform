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
      links: [{ rel: 'stylesheet', href: css }],
    }),
    shellComponent: RootDocument,
  },
)

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark h-full" lang="en">
      <head>
        <HeadContent />
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
