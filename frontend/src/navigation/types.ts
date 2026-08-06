import type { NavigatorScreenParams } from '@react-navigation/native';
import type { OtpPurpose } from '../api/auth';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  VerifyOtp: { identifier: string; purpose: OtpPurpose };
};

export type MainTabsParamList = {
  Home: undefined;
  Communities: undefined;
  Chats: undefined;
  Profile: undefined;
};

export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabsParamList>;
  Chat: { userId: string; displayName: string };
  CommunityDetail: { identifier: string };
  CreateCommunity: { identifier?: string } | undefined;
  GroupChat: { groupId: string; name: string };
  CreateGroup: undefined;
  RecoveryKeySetup: undefined;
  RestoreRecovery: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};
