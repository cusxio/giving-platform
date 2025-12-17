import type { MenuButtonProps as AriakitMenuButtonProps } from '@ariakit/react'
import { MenuButton as AriakitMenuButton } from '@ariakit/react'

interface MenuButtonProps extends AriakitMenuButtonProps {}

export function MenuButton(props: MenuButtonProps) {
  return <AriakitMenuButton {...props} />
}
