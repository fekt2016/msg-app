import { z } from 'zod';
import { PUSH_PLATFORMS } from './pushDevice.model.js';

export const registerDeviceSchema = {
  body: z.object({
    // The client-generated device id (expo-application) — an opaque string, not
    // a Mongo ObjectId. The authenticated user is taken from the token, never
    // the body.
    deviceId: z.string().min(1).max(128),
    pushToken: z.string().min(1).max(256),
    platform: z.enum(PUSH_PLATFORMS),
    appVersion: z.string().max(32).optional(),
  }),
};

export const unregisterDeviceSchema = {
  params: z.object({
    deviceId: z.string().min(1).max(128),
  }),
};
