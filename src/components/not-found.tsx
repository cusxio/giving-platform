import {
  ArrowLeftIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr'
import { Link } from '@tanstack/react-router'

import { cx } from '#/styles/cx'

import { FooterCopyright } from './footer-copyright'
import { HeaderLogo } from './header-logo'
import { Button, buttonVariants } from './ui/button'

export function NotFound() {
  return (
    <>
      <HeaderLogo />

      <main className="flex shrink-0 grow flex-col items-center justify-center gap-y-4 p-4">
        <div className="flex flex-col items-center gap-y-4">
          <WarningCircleIcon className="text-fg-warning" size={32} />

          <h1 className="text-center text-xl text-fg-1 sm:text-2xl">
            This page isn’t available
          </h1>
          <p className="text-center text-balance text-fg-muted">
            But your purpose here still is — let’s take you home.
          </p>
        </div>

        <Button
          render={
            <Link
              className={cx(buttonVariants.subtle, 'mt-4 h-10 gap-x-2')}
              replace
              to="/"
            />
          }
        >
          <ArrowLeftIcon />
          Return to Home
        </Button>
      </main>

      <FooterCopyright />
    </>
  )
}
