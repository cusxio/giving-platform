import { ArrowLeftIcon, SmileyXEyesIcon } from '@phosphor-icons/react/dist/ssr'
import { createFileRoute, Link } from '@tanstack/react-router'

import { FooterCopyright } from '#/components/footer-copyright'
import { HeaderLogo } from '#/components/header-logo'
import { Button, buttonVariants } from '#/components/ui/button'
import { cx } from '#/styles/cx'

export const Route = createFileRoute('/uh-oh')({ component: RouteComponent })

function RouteComponent() {
  return (
    <>
      <HeaderLogo />

      <main className="flex shrink-0 grow flex-col items-center justify-center gap-y-4 p-4">
        <div className="flex flex-col items-center gap-y-4">
          <SmileyXEyesIcon className="text-fg-error" size={32} />

          <h1 className="text-center text-xl text-fg-1 sm:text-2xl">
            Uh-oh. That wasn't supposed to happen
          </h1>
          <p className="text-center text-balance text-fg-muted">
            We‘re sorry, but we couldn‘t complete your request. Please try again
            in a few moments, or return to the homepage.
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
