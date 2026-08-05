import { apiClient } from './client';

export type OtpPurpose = 'VERIFY' | 'RESET' | 'LOGIN';

export interface AvatarAsset {
  publicId: string;
  url: string;
  width: number;
  height: number;
}

export interface SafeUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  bio: string;
  avatar: AvatarAsset | null;
  role: string;
  status: string;
  isVerified: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult extends TokenPair {
  user: SafeUser;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface RegisterResponse {
  userId: string;
}

interface SentResponse {
  sent: boolean;
}

export async function register(input: {
  identifier: string;
  password: string;
  displayName: string;
}): Promise<string> {
  const res = await apiClient.post<ApiEnvelope<RegisterResponse>>('/auth/register', input);
  return res.data.data.userId;
}

export async function resendOtp(input: { identifier: string; purpose: OtpPurpose }): Promise<void> {
  await apiClient.post<ApiEnvelope<SentResponse>>('/auth/resend-otp', input);
}

export async function verifyOtp(input: {
  identifier: string;
  purpose: OtpPurpose;
  code: string;
  deviceId: string;
}): Promise<AuthResult> {
  const res = await apiClient.post<ApiEnvelope<AuthResult>>('/auth/verify-otp', input);
  return res.data.data;
}

export async function login(input: {
  identifier: string;
  password: string;
  deviceId: string;
}): Promise<AuthResult> {
  const res = await apiClient.post<ApiEnvelope<AuthResult>>('/auth/login', input);
  return res.data.data;
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const res = await apiClient.post<ApiEnvelope<TokenPair>>('/auth/refresh', { refreshToken });
  return res.data.data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post<ApiEnvelope<SentResponse>>('/auth/logout', { refreshToken });
}
