import {
  generateRecoveryPhrase,
  normalizeRecoveryPhrase,
  isValidRecoveryPhrase,
  createRecoveryBackup,
  restoreRecoveryBackup,
  RecoveryPhraseError,
  RECOVERY_BACKUP_VERSION,
  type RecoveryKdfParams,
} from './recovery';
import { generateE2eeKeys } from './crypto';
import type { E2eeKeyBundle } from './types';

// Cheap Argon2 params so the real KDF still runs (no mocking) but fast. Restore
// reads params from the blob, so it stays cheap too. Production uses ~19 MiB.
const FAST_KDF: RecoveryKdfParams = {
  algorithm: 'argon2id',
  memoryKiB: 256,
  iterations: 1,
  parallelism: 1,
};

describe('recovery phrase', () => {
  it('generates a valid 24-word BIP39 phrase', () => {
    const phrase = generateRecoveryPhrase();
    expect(phrase.split(' ')).toHaveLength(24);
    expect(isValidRecoveryPhrase(phrase)).toBe(true);
  });

  it('normalizes casing and whitespace', () => {
    expect(normalizeRecoveryPhrase('  Abandon   ABILITY able ')).toBe('abandon ability able');
  });

  it('rejects a phrase with a broken checksum or unknown word', () => {
    const phrase = generateRecoveryPhrase();
    const broken = phrase.split(' ').slice(0, 23).concat('zoo').join(' ');
    expect(isValidRecoveryPhrase(broken)).toBe(false);
    expect(isValidRecoveryPhrase('not real words at all')).toBe(false);
  });
});

describe('recovery backup round-trip', () => {
  let bundle: E2eeKeyBundle;
  let phrase: string;

  beforeAll(async () => {
    bundle = await generateE2eeKeys(2, 2);
    phrase = generateRecoveryPhrase();
  });

  it('restores the exact bundle with the correct phrase', () => {
    const blob = createRecoveryBackup(bundle, phrase, FAST_KDF);
    expect(blob.version).toBe(RECOVERY_BACKUP_VERSION);
    expect(blob.kdf.algorithm).toBe('argon2id');

    const restored = restoreRecoveryBackup(blob, phrase);
    expect(restored).toEqual(bundle);
    // The private halves must survive the round-trip — that's the whole point.
    expect(restored.identityKey.privateKey).toBe(bundle.identityKey.privateKey);
    expect(restored.identityKey.signingPrivateKey).toBe(bundle.identityKey.signingPrivateKey);
  });

  it('normalizes the phrase on restore (different casing still works)', () => {
    const blob = createRecoveryBackup(bundle, phrase, FAST_KDF);
    const restored = restoreRecoveryBackup(blob, `  ${phrase.toUpperCase()}  `);
    expect(restored).toEqual(bundle);
  });

  it('throws RecoveryPhraseError for a wrong phrase', () => {
    const blob = createRecoveryBackup(bundle, phrase, FAST_KDF);
    const wrong = generateRecoveryPhrase();
    expect(() => restoreRecoveryBackup(blob, wrong)).toThrow(RecoveryPhraseError);
  });

  it('throws RecoveryPhraseError for tampered ciphertext', () => {
    const blob = createRecoveryBackup(bundle, phrase, FAST_KDF);
    const flipped = blob.ciphertext[0] === 'A' ? 'B' : 'A';
    const tampered = { ...blob, ciphertext: flipped + blob.ciphertext.slice(1) };
    expect(() => restoreRecoveryBackup(tampered, phrase)).toThrow(RecoveryPhraseError);
  });

  it('rejects an unsupported backup version', () => {
    const blob = createRecoveryBackup(bundle, phrase, FAST_KDF);
    expect(() => restoreRecoveryBackup({ ...blob, version: 99 }, phrase)).toThrow(
      /Unsupported recovery backup version/,
    );
  });
});
