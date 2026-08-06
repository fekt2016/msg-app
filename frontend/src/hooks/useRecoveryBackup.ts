import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  enableRecoveryBackup,
  disableRecoveryBackup,
  getRecoveryBackupStatus,
  restoreFromRecoveryPhrase,
} from '../e2ee/recoverySession';

export const recoveryKeys = {
  all: ['recovery'] as const,
  status: () => [...recoveryKeys.all, 'status'] as const,
};

export function useRecoveryBackupStatus() {
  return useQuery({
    queryKey: recoveryKeys.status(),
    queryFn: () => getRecoveryBackupStatus(),
  });
}

export function useEnableRecoveryBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (phrase: string) => enableRecoveryBackup(phrase),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recoveryKeys.status() });
    },
  });
}

export function useDisableRecoveryBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => disableRecoveryBackup(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recoveryKeys.status() });
    },
  });
}

export function useRestoreRecovery() {
  return useMutation({
    mutationFn: ({ userId, phrase }: { userId: string; phrase: string }) =>
      restoreFromRecoveryPhrase(userId, phrase),
  });
}
