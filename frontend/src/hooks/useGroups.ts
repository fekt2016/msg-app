import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  getGroup,
  leaveGroup,
  listGroupMembers,
  listGroupMessages,
  listGroups,
  removeGroupMember,
  type CreateGroupInput,
} from '../api/groups';

export const groupKeys = {
  all: ['groups'] as const,
  list: () => [...groupKeys.all, 'list'] as const,
  detail: (groupId: string) => [...groupKeys.all, 'detail', groupId] as const,
  members: (groupId: string) => [...groupKeys.all, 'members', groupId] as const,
  messages: (groupId: string) => [...groupKeys.all, 'messages', groupId] as const,
};

export function useGroups() {
  return useQuery({
    queryKey: groupKeys.list(),
    queryFn: () => listGroups(),
  });
}

export function useGroup(groupId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: () => getGroup(groupId),
    enabled: options.enabled ?? true,
  });
}

export function useGroupMembers(groupId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: groupKeys.members(groupId),
    queryFn: () => listGroupMembers(groupId, { pageSize: 100 }),
    enabled: options.enabled ?? true,
  });
}

export function useGroupMessages(groupId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: groupKeys.messages(groupId),
    queryFn: () => listGroupMessages(groupId),
    enabled: options.enabled ?? true,
    // Always refetch on mount so re-entering a group chat reloads the latest
    // history instead of serving a stale cached page.
    refetchOnMount: 'always',
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => createGroup(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
}

export function useAddGroupMembers(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberIds: string[]) => addGroupMembers(groupId, memberIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
      void queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    },
  });
}

export function useRemoveGroupMember(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeGroupMember(groupId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupKeys.members(groupId) });
      void queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    },
  });
}

export function useLeaveGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => leaveGroup(groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
}

export function useDeleteGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteGroup(groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
}
