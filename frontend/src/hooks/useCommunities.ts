import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCommunity,
  deleteCommunity,
  getCommunity,
  joinCommunity,
  leaveCommunity,
  listCommunities,
  listCommunityMembers,
  updateCommunity,
  updateMemberRole,
  type CreateCommunityInput,
  type CommunityVisibility,
  type MemberRole,
} from '../api/communities';

export const communityKeys = {
  all: ['communities'] as const,
  list: (filters: { q?: string; page?: number; pageSize?: number }) =>
    [...communityKeys.all, 'list', filters] as const,
  detail: (identifier: string) => [...communityKeys.all, 'detail', identifier] as const,
  members: (identifier: string) => [...communityKeys.all, 'members', identifier] as const,
};

export function useCommunities(params: { q?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: communityKeys.list(params),
    queryFn: () => listCommunities(params),
  });
}

export function useCommunity(identifier: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: communityKeys.detail(identifier),
    queryFn: () => getCommunity(identifier),
    enabled: options.enabled ?? true,
  });
}

export function useCommunityMembers(
  identifier: string,
  params: { page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: communityKeys.members(identifier),
    queryFn: () => listCommunityMembers(identifier, params),
  });
}

export function useCreateCommunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommunityInput) => createCommunity(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useJoinCommunity(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => joinCommunity(identifier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.detail(identifier) });
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useLeaveCommunity(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => leaveCommunity(identifier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.detail(identifier) });
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useUpdateCommunity(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name?: string;
      description?: string;
      visibility?: CommunityVisibility;
    }) => updateCommunity(identifier, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.detail(identifier) });
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useUpdateMemberRole(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Exclude<MemberRole, 'OWNER'> }) =>
      updateMemberRole(identifier, userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.members(identifier) });
      void queryClient.invalidateQueries({ queryKey: communityKeys.detail(identifier) });
    },
  });
}

export function useDeleteCommunity(identifier: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteCommunity(identifier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}
