import { apiClient } from './client';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export type PushPlatform = 'android' | 'ios' | 'web';

export interface PushDevice {
  deviceId: string;
  platform: PushPlatform;
  appVersion: string;
  updatedAt: string;
}

export interface RegisterDeviceInput {
  deviceId: string;
  pushToken: string;
  platform: PushPlatform;
  appVersion?: string;
}

export async function registerDevice(input: RegisterDeviceInput): Promise<PushDevice> {
  const { data } = await apiClient.post<ApiEnvelope<PushDevice>>('/push/devices', input);
  return data.data;
}

export async function listDevices(): Promise<PushDevice[]> {
  const { data } = await apiClient.get<ApiEnvelope<PushDevice[]>>('/push/devices');
  return data.data;
}

export async function unregisterDevice(deviceId: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<{ deleted: boolean }>>(
    `/push/devices/${encodeURIComponent(deviceId)}`,
  );
}
