// Pure-JS base64 codec for binary key/ciphertext material.
//
// React Native's Hermes engine does not provide `btoa`/`atob` (nor `Buffer`),
// so the E2EE code cannot rely on them. This self-contained encoder/decoder
// works identically in Hermes, Expo Go, and Node (tests), which keeps the
// crypto verifiable off-device.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) {
  LOOKUP[ALPHABET[i]] = i;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      ALPHABET[(n >> 18) & 63] +
      ALPHABET[(n >> 12) & 63] +
      ALPHABET[(n >> 6) & 63] +
      ALPHABET[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + '=';
  }
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  // Keep '=' so length stays a multiple of 4 and padding is counted correctly;
  // drop only stray whitespace/newlines.
  const str = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const pad = str.endsWith('==') ? 2 : str.endsWith('=') ? 1 : 0;
  const byteLength = (str.length / 4) * 3 - pad;
  const bytes = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i < str.length; i += 4) {
    const n =
      ((LOOKUP[str[i]] ?? 0) << 18) |
      ((LOOKUP[str[i + 1]] ?? 0) << 12) |
      ((LOOKUP[str[i + 2]] ?? 0) << 6) |
      (LOOKUP[str[i + 3]] ?? 0);
    if (p < byteLength) bytes[p++] = (n >> 16) & 0xff;
    if (p < byteLength) bytes[p++] = (n >> 8) & 0xff;
    if (p < byteLength) bytes[p++] = n & 0xff;
  }
  return bytes;
}
