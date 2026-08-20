import { randomInt } from 'node:crypto';

const ALPHANUMERIC =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateHash(length = 16): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALPHANUMERIC[randomInt(ALPHANUMERIC.length)];
  }
  return result;
}
