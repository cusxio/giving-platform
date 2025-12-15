import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

import { createTracedHandler } from './server/opentelemetry/create-traced-handler'
const fetch = createTracedHandler(createStartHandler(defaultStreamHandler))

export default createServerEntry({ fetch })
