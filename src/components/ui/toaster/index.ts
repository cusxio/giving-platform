import { toast as baseToast } from 'sonner'

export const toast = Object.assign(baseToast, {
  unexpected() {
    return baseToast.error('Something unexpected has occurred.', {
      description: 'Please try again later.',
    })
  },
})
