import { bytesToBase64, base64ToBytes } from './base64';

describe('base64 codec', () => {
  it('round-trips byte arrays of every length class (incl. 32-byte keys)', () => {
    for (const len of [0, 1, 2, 3, 4, 15, 16, 31, 32, 33, 64, 65]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 11) & 0xff;
      const roundTripped = base64ToBytes(bytesToBase64(bytes));
      expect(roundTripped).toHaveLength(len);
      expect(roundTripped).toEqual(bytes);
    }
  });

  it('matches a known base64 vector', () => {
    const bytes = new TextEncoder().encode('Man');
    expect(bytesToBase64(bytes)).toBe('TWFu');
    expect(base64ToBytes('TWFu')).toEqual(bytes);
  });

  it('decodes padded values to the exact byte length', () => {
    // 1 byte -> 2 padding chars, 2 bytes -> 1 padding char.
    expect(base64ToBytes(bytesToBase64(new Uint8Array([0xff])))).toEqual(new Uint8Array([0xff]));
    expect(base64ToBytes(bytesToBase64(new Uint8Array([0xff, 0x00])))).toEqual(
      new Uint8Array([0xff, 0x00]),
    );
  });
});
