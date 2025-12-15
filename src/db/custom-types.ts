// import {
//   decodeBase64urlIgnorePadding,
//   encodeBase64urlNoPadding,
// } from '@oslojs/encoding'
import { customType } from 'drizzle-orm/sqlite-core'
// import { parse, validate } from 'uuid'

import { format, serverTz, TZDate } from '#/core/date'

export const datetime = customType<{ data: Date; driverData: string }>({
  dataType() {
    return 'datetime'
  },
  fromDriver(v) {
    // NOTE: TanStack can't serialize non-standard date objects,
    //       so we need to convert them to regular Date instances.
    return new Date(new TZDate(v, serverTz))
  },
  toDriver(v) {
    return format(new TZDate(v, serverTz), 'yyyy-MM-dd HH:mm:ss.S')
  },
})

export const decimal = customType<{
  config: { precision: number; scale: number }
  data: string
  dataType: number
}>({
  dataType(config) {
    if (config === undefined) {
      return 'decimal'
    }
    const { precision, scale } = config
    return `decimal(${precision},${scale})`
  },
})

// export const uuid = customType<{ data: string; driverData: Uint8Array }>({
//   dataType() {
//     return 'blob'
//   },
//   fromDriver(v) {
//     return encodeBase64urlNoPadding(v)
//   },
//   toDriver(v) {
//     if (validate(v)) {
//       return parse(v)
//     }
//     return decodeBase64urlIgnorePadding(v)
//   },
// })
