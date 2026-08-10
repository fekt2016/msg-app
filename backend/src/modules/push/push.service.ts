import { AppError } from '../../errors/AppError.js';
import { logger } from '../../config/logger.js';
import { presenceStore } from '../../realtime/presence.js';
import { pushProvider } from './push.provider.js';
import { pushDeviceRepository, type UpsertDeviceInput } from './pushDevice.repository.js';
import type { PushDeviceDoc, PushPlatform } from './pushDevice.model.js';

export interface PublicDevice {
  deviceId: string;
  platform: PushPlatform;
  appVersion: string;
  updatedAt: Date;
}

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// A notification, or a builder resolved only when a push is actually going out
// (recipient offline + has device tokens). The lazy form lets callers defer
// expensive enrichment (e.g. a sender-name lookup) off the hot message path so
// it never runs for the common online-recipient case.
export type NotificationInput =
  PushNotification | (() => PushNotification | Promise<PushNotification>);

async function resolveNotification(input: NotificationInput): Promise<PushNotification> {
  return typeof input === 'function' ? input() : input;
}

// The push token is a delivery secret — never echo it back to clients.
function toPublicDevice(device: PushDeviceDoc): PublicDevice {
  return {
    deviceId: device.deviceId,
    platform: device.platform,
    appVersion: device.appVersion,
    updatedAt: device.updatedAt,
  };
}

export const pushService = {
  async registerDevice(input: UpsertDeviceInput): Promise<PublicDevice> {
    const device = await pushDeviceRepository.upsertByDeviceId(input);
    return toPublicDevice(device);
  },

  async unregisterDevice(userId: string, deviceId: string): Promise<void> {
    const removed = await pushDeviceRepository.deleteByDeviceIdForUser(deviceId, userId);
    if (!removed) {
      throw new AppError(404, 'DEVICE_NOT_FOUND', 'No registered device found for this user.');
    }
  },

  async listDevices(userId: string): Promise<PublicDevice[]> {
    const devices = await pushDeviceRepository.listByUserId(userId);
    return devices.map(toPublicDevice);
  },

  /**
   * Send a notification to a single user only if they are currently offline
   * (an online user already receives the live socket event). Best-effort:
   * never throws — callers fire-and-forget from the realtime path.
   */
  async notifyIfOffline(userId: string, notification: NotificationInput): Promise<void> {
    try {
      const online = await presenceStore.getOnlineUserIds();
      if (online.includes(userId)) {
        return;
      }
      const tokens = await pushDeviceRepository.listTokensByUserId(userId);
      if (tokens.length === 0) {
        return;
      }
      await pushProvider.send({ tokens, ...(await resolveNotification(notification)) });
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to send push notification');
    }
  },

  /**
   * Fan-out variant for group/channel messages: notifies every recipient that
   * is currently offline. Excludes `senderId` so authors never push
   * themselves. Best-effort — never throws.
   */
  async notifyOfflineUsers(
    userIds: string[],
    senderId: string,
    notification: NotificationInput,
  ): Promise<void> {
    try {
      const online = new Set(await presenceStore.getOnlineUserIds());
      const recipients = userIds.filter((id) => id !== senderId && !online.has(id));
      if (recipients.length === 0) {
        return;
      }
      const tokenLists = await Promise.all(
        recipients.map((id) => pushDeviceRepository.listTokensByUserId(id)),
      );
      const tokens = tokenLists.flat();
      if (tokens.length === 0) {
        return;
      }
      await pushProvider.send({ tokens, ...(await resolveNotification(notification)) });
    } catch (err) {
      logger.warn({ err, senderId }, 'Failed to send group push notifications');
    }
  },
};
