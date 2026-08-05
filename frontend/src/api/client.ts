import axios from 'axios';
import type { AxiosError } from 'axios';
import Constants from 'expo-constants';
export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

const host =
  (Constants.expoConfig?.extra as { API_URL?: string } | undefined)?.API_URL ??
  'http://10.0.2.2:5000/api/v1';

export const apiClient = axios.create({
  baseURL: host,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export function isApiError(err: unknown): err is AxiosError<ApiErrorBody> {
  return axios.isAxiosError(err);
}

export function apiErrorMessage(err: unknown): string {
  if (isApiError(err) && err.response?.data?.error?.message) {
    return err.response.data.error.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}
