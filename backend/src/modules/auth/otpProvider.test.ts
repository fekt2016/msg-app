import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../config/logger.js';
import { generateOtpCode, hashOtpCode, otpProvider } from './otpProvider.js';

describe('otpProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a 6-digit numeric code', () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('hashes OTP codes with sha256', () => {
    const hash = hashOtpCode('123456');
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe('123456');
  });

  it('uses the logging provider when SMS is disabled', async () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    await otpProvider.send({ identifier: 'test@example.com', code: '123456', purpose: 'VERIFY' });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'test@example.com' }),
      expect.stringContaining('123456'),
    );
  });
});
