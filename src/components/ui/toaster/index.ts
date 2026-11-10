import type { ExternalToast, toast as SonnerToast } from 'sonner'

let sonner: Promise<typeof SonnerToast | null> | undefined

function show(call: (toast: typeof SonnerToast) => unknown) {
  sonner ??= import('sonner').then(
    (m) => m.toast,
    (error: unknown) => {
      sonner = undefined
      console.error('Could not load the toast code', error)
      return null
    },
  )
  void sonner.then((toast) => toast && call(toast))
}

export const toast = {
  error(message: string, data?: ExternalToast) {
    show((t) => t.error(message, data))
  },
  success(message: string, data?: ExternalToast) {
    show((t) => t.success(message, data))
  },
  unexpected() {
    toast.error('Something unexpected has occurred.', { description: 'Please try again later.' })
  },
}
