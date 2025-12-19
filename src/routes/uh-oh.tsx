import { createFileRoute } from '@tanstack/react-router'

import { Error } from '#/components/error'
import { FooterCopyright } from '#/components/footer-copyright'
import { HeaderLogo } from '#/components/header-logo'

export const Route = createFileRoute('/uh-oh')({ component: RouteComponent })

function RouteComponent() {
  return (
    <>
      <HeaderLogo />

      <Error />

      <FooterCopyright />
    </>
  )
}
