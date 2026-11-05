import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

import { createTracedHandler } from './server/opentelemetry/create-traced-handler.server'
import { startTelemetry } from './server/opentelemetry/sdk.server'

const telemetry = startTelemetry()
const fetch = createTracedHandler(createStartHandler(defaultStreamHandler), telemetry)

export default createServerEntry({ fetch })
