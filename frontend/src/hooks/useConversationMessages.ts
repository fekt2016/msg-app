import { useQuery } from '@tanstack/react-query';
import { listConversationMessages } from '../api/messages';

export const messageKeys = {
  all: ['messages'] as const,
  conversation: (userId: string) => [...messageKeys.all, 'conversation', userId] as const,
};

export function useConversationMessages(userId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: messageKeys.conversation(userId),
    queryFn: () => listConversationMessages(userId),
    enabled: options.enabled ?? true,
  });
}
