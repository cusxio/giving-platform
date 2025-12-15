import { customAlphabet } from 'nanoid'
import { alphanumeric } from 'nanoid-dictionary'

export function createId(length?: number): string {
  return customAlphabet(alphanumeric, length)()
}
