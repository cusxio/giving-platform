import { toast as baseToast } from 'sonner'

const toast = baseToast as typeof baseToast & {
  unexpected: () => ReturnType<typeof toast.error>
}

toast.unexpected = function () {
  return toast.error('Something unexpected has occurred.', {
    description: 'Please try again later.',
  })
}

export { toast }
