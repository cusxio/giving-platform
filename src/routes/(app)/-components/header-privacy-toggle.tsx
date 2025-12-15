import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react/dist/ssr'
import { createElement } from 'react'

import { Button } from '#/components/ui/button'
import { UserSettings } from '#/db/schema'
import { useUpdatePrivacyModeMutation } from '#/features/user/user.mutations'

interface HeaderPrivacyToggleProps {
  userSettings: Pick<UserSettings, 'privacyMode'>
}

export function HeaderPrivacyToggle(props: HeaderPrivacyToggleProps) {
  const { userSettings } = props
  const { privacyMode } = userSettings

  const togglePrivacyMode = useUpdatePrivacyModeMutation()

  return (
    <Button
      className="h-12 w-12 text-fg-subtle"
      onClick={() => {
        togglePrivacyMode.mutate(!privacyMode)
      }}
    >
      {createElement(privacyMode ? EyeSlashIcon : EyeIcon, {
        weight: 'duotone',
        size: 22,
      })}
    </Button>
  )
}
