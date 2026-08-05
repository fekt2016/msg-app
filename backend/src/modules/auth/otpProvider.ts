import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../errors/AppError.js';

export interface OtpMessage {
  identifier: string;
  code: string;
  purpose: string;
}

export interface OtpProvider {
  send(message: OtpMessage): Promise<void>;
}

/**
 * Sends OTPs via Africa's Talking SMS. When SMS is disabled (local dev /
 * tests / CI), the code is logged instead of sent — it is never returned
 * to callers in production environments.
 */
class AfricasTalkingOtpProvider implements OtpProvider {
  async send(message: OtpMessage): Promise<void> {
    if (!env.AFRICASTALKING_API_KEY) {
      throw new AppError(
        500,
        'SMS_PROVIDER_NOT_CONFIGURED',
        'SMS provider is not configured. Set AFRICASTALKING_API_KEY.',
      );
    }

    const isPhone = /^\+?[0-9]{10,15}$/.test(message.identifier);
    if (!isPhone) {
      throw new AppError(
        400,
        'INVALID_PHONE',
        'OTP delivery via SMS requires a valid phone number.',
      );
    }

    // Lazy import keeps the dependency out of non-SMS code paths and
    // avoids initialisation cost when the provider is disabled.
    const { default: AfricasTalking } = await import('africastalking');
    const client = AfricasTalking({
      apiKey: env.AFRICASTALKING_API_KEY,
      username: env.AFRICASTALKING_USERNAME,
    });

    await client.SMS.send({
      to: [message.identifier],
      message: `Your Eaz Community verification code is ${message.code}. It expires in ${env.OTP_EXPIRES_IN_MINUTES} minutes.`,
      from: env.AFRICASTALKING_SENDER_ID || undefined,
    });
  }
}

class LoggingOtpProvider implements OtpProvider {
  async send(message: OtpMessage): Promise<void> {
    logger.info(
      { identifier: message.identifier, purpose: message.purpose },
      `[OTP ${message.purpose}] code: ${message.code}`,
    );
  }
}

function buildProvider(): OtpProvider {
  if (env.SMS_ENABLED && env.AFRICASTALKING_API_KEY) {
    return new AfricasTalkingOtpProvider();
  }
  return new LoggingOtpProvider();
}

export function generateOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export const otpProvider: OtpProvider = buildProvider();
