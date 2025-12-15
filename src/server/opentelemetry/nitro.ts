import { definePlugin } from 'nitro'

import { Sdk } from './sdk'

export default definePlugin((nitro) => {
  const sdk = new Sdk()
  sdk.start()

  nitro.hooks.hook('close', async () => {
    await sdk.shutdown()
  })
})
