import { useQuery } from '@tanstack/react-query';
import { listUsers } from '../api/users';

export const chatUserKeys = {
  all: ['chatUsers'] as const,
  list: () => [...chatUserKeys.all, 'list'] as const,
};

export function useChatUsers() {
  return useQuery({
    queryKey: chatUserKeys.list(),
    queryFn: () => listUsers(),
  });
}
