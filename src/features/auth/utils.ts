import { generateRandomString } from '@oslojs/crypto/random'
import type { RandomReader } from '@oslojs/crypto/random'

const random: RandomReader = {
  read(bytes) {
    crypto.getRandomValues(bytes)
  },
}

export function generateOtp() {
  let otp = generateRandomOtp()

  while (Number(otp) < 100_000) {
    otp = generateRandomOtp()
  }

  return otp
}

function generateRandomOtp() {
  return generateRandomString(random, '0123456789', 6)
}
